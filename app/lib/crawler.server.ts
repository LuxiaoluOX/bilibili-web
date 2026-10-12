import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import { getLatestVideos, getVideoDescriptionFromPage, getVideoDetail, isBilibiliRiskControlError } from "./bilibili.server";
import { getPool, query, transaction } from "./db.server";
import { normalizeLabel, parseWeaponCodes } from "./parser";
import type { ParsedCandidate } from "./parser";
import type { IngestionMethod, SourceType } from "./domain";
import { detectGameMode, type GameMode } from "./game-modes";
import { getWeaponCatalog, recordWeaponDiscovery } from "./weapon-catalog.server";
import { CandidateReviewConflictError, CandidateReviewValidationError } from "./review.server";

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

// PostgreSQL text values cannot contain NUL bytes. External Bilibili text can
// occasionally include one, so strip it at the ingestion boundary.
export function sanitizePostgresText(value: string) {
  return value.replace(/\u0000/g, "");
}

async function attachVersion(client: pg.PoolClient, candidateId: string, sourceId: string, creatorId: string, candidate: ParsedCandidate) {
  if (!candidate.weaponName || !candidate.buildName) return;
  const normalizedWeapon = normalizeLabel(candidate.weaponName);
  const normalizedBuild = normalizeLabel(candidate.buildName);
  const lockKey = `${creatorId}:${candidate.gameMode}:${normalizedWeapon}:${normalizedBuild}`;
  await client.query("select pg_advisory_xact_lock(hashtext($1))", [lockKey]);
  const buildResult = await client.query<{ id: string; current_version: number }>(
    `insert into weapon_builds (creator_id, game_mode, weapon_name, normalized_weapon, build_name, normalized_build_name)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (creator_id, game_mode, normalized_weapon, normalized_build_name)
     do update set weapon_name = excluded.weapon_name, build_name = excluded.build_name, updated_at = now()
     returning id, current_version`,
    [creatorId, candidate.gameMode, candidate.weaponName, normalizedWeapon, candidate.buildName, normalizedBuild],
  );
  const build = buildResult.rows[0];
  const existing = await client.query<{ id: string; version: number }>("select id, version from weapon_build_versions where build_id = $1 and code = $2", [build.id, candidate.normalizedCode]);
  let versionId = existing.rows[0]?.id;
  let versionNumber = existing.rows[0]?.version;
  if (!versionId) {
    const next = await client.query<{ version: number }>(
      "select coalesce(max(version), 0)::integer + 1 version from weapon_build_versions where build_id = $1",
      [build.id],
    );
    const nextVersion = next.rows[0].version;
    const inserted = await client.query<{ id: string }>(
      `insert into weapon_build_versions (build_id, game_mode, version, code, created_from_candidate_id)
       values ($1, $2, $3, $4, $5) returning id`,
      [build.id, candidate.gameMode, nextVersion, candidate.normalizedCode, candidateId],
    );
    versionId = inserted.rows[0].id;
    versionNumber = nextVersion;
  } else {
    await client.query("update weapon_build_versions set last_seen_at = now() where id = $1", [versionId]);
  }
  await client.query(
    `insert into version_sources (version_id, source_content_id) values ($1, $2)
     on conflict (version_id, source_content_id) do update set last_seen_at = now()`,
    [versionId, sourceId],
  );
  const publication = await client.query<{ published_at: Date | null }>(
    "select published_at from source_contents where id = $1",
    [sourceId],
  );
  await client.query(
    `update weapon_build_versions
     set source_published_at = case
       when $2::timestamptz is null then source_published_at
       when source_published_at is null or source_published_at < $2 then $2
       else source_published_at end
     where id = $1`,
    [versionId, publication.rows[0]?.published_at ?? null],
  );
  const latest = await client.query<{ version: number; source_published_at: Date | null }>(
    `select version, source_published_at from weapon_build_versions
     where build_id = $1
     order by source_published_at desc nulls last, version desc limit 1`,
    [build.id],
  );
  // Publication time, rather than ingestion time, determines the current
  // code. A later video can therefore reactivate an older code without
  // creating a duplicate version row.
  await client.query(
    "update weapon_builds set current_version = $2, latest_source_published_at = $3, updated_at = now() where id = $1",
    [build.id, latest.rows[0]?.version ?? versionNumber, latest.rows[0]?.source_published_at ?? null],
  );
}

type StoredCandidate = {
  id: string;
  raw_code: string;
  normalized_code: string;
  weapon_id: string | null;
  weapon_name: string | null;
  suggested_weapon: string | null;
  build_name: string | null;
  confidence: string;
  code_confidence: string;
  weapon_confidence: string;
  attribution_status: ParsedCandidate["attributionStatus"];
  status: ParsedCandidate["status"];
  game_mode: GameMode;
};

type ReconcileResult = {
  candidatesFound: number;
  candidatesIgnored: number;
  versionsRemoved: number;
  buildsRemoved: number;
};

function storedCandidateToParsed(row: StoredCandidate, sourceType: SourceType): ParsedCandidate {
  return {
    rawCode: row.raw_code,
    normalizedCode: row.normalized_code,
    weaponName: row.weapon_name,
    weaponId: row.weapon_id,
    suggestedWeapon: row.suggested_weapon,
    buildName: row.build_name,
    confidence: Number(row.confidence),
    codeConfidence: Number(row.code_confidence),
    weaponConfidence: Number(row.weapon_confidence),
    attributionStatus: row.attribution_status,
    status: row.status,
    sourceType,
    gameMode: row.game_mode,
  };
}

async function refreshCurrentBuildVersions(client: pg.PoolClient) {
  await client.query(
    `with ranked as (
       select wbv.build_id, wbv.version, wbv.source_published_at,
              row_number() over (
                partition by wbv.build_id
                order by wbv.source_published_at desc nulls last, wbv.version desc
              ) position
       from weapon_build_versions wbv
     )
     update weapon_builds wb
     set current_version = ranked.version,
         latest_source_published_at = ranked.source_published_at,
         updated_at = now()
     from ranked
     where ranked.build_id = wb.id and ranked.position = 1`,
  );
}

async function reconcileParsedSource(
  client: pg.PoolClient,
  input: { sourceId: string; creatorId: string; sourceType: SourceType; rawText: string; gameMode: GameMode },
): Promise<ReconcileResult> {
  const catalog = await getWeaponCatalog(client);
  const parsed = parseWeaponCodes(input.rawText, input.sourceType, catalog, input.gameMode);
  const uniqueParsed = [...new Map(parsed.map((candidate) => [candidate.normalizedCode, candidate])).values()];
  const parsedCodes = uniqueParsed.map((candidate) => candidate.normalizedCode);

  // Rebuild the source-to-version projection from accepted candidates. Human-reviewed
  // candidates remain authoritative; parser-owned candidates may be updated or retired.
  const previousVersions = await client.query<{ version_id: string }>(
    "select version_id from version_sources where source_content_id = $1",
    [input.sourceId],
  );
  await client.query("delete from version_sources where source_content_id = $1", [input.sourceId]);

  for (const candidate of uniqueParsed) {
    const inserted = await client.query<StoredCandidate>(
      `insert into extraction_candidates
       (source_content_id, creator_id, game_mode, raw_code, normalized_code, weapon_id, weapon_name, normalized_weapon,
        suggested_weapon, build_name, normalized_build_name, confidence, code_confidence, weapon_confidence, attribution_status, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       on conflict (source_content_id, normalized_code) do update set
         game_mode = case
           when extraction_candidates.game_mode_override or extraction_candidates.reviewed_at is not null
             then extraction_candidates.game_mode
           else excluded.game_mode
         end,
         raw_code = case when extraction_candidates.reviewed_at is null then excluded.raw_code else extraction_candidates.raw_code end,
         weapon_id = case when extraction_candidates.reviewed_at is null then excluded.weapon_id else extraction_candidates.weapon_id end,
         weapon_name = case when extraction_candidates.reviewed_at is null then excluded.weapon_name else extraction_candidates.weapon_name end,
         normalized_weapon = case when extraction_candidates.reviewed_at is null then excluded.normalized_weapon else extraction_candidates.normalized_weapon end,
         suggested_weapon = case when extraction_candidates.reviewed_at is null then excluded.suggested_weapon else extraction_candidates.suggested_weapon end,
         build_name = case when extraction_candidates.reviewed_at is null then excluded.build_name else extraction_candidates.build_name end,
         normalized_build_name = case when extraction_candidates.reviewed_at is null then excluded.normalized_build_name else extraction_candidates.normalized_build_name end,
         confidence = case when extraction_candidates.reviewed_at is null then excluded.confidence else extraction_candidates.confidence end,
         code_confidence = case when extraction_candidates.reviewed_at is null then excluded.code_confidence else extraction_candidates.code_confidence end,
         weapon_confidence = case when extraction_candidates.reviewed_at is null then excluded.weapon_confidence else extraction_candidates.weapon_confidence end,
         attribution_status = case when extraction_candidates.reviewed_at is null then excluded.attribution_status else extraction_candidates.attribution_status end,
         status = case when extraction_candidates.reviewed_at is null then excluded.status else extraction_candidates.status end
       returning id, raw_code, normalized_code, weapon_id, weapon_name, suggested_weapon, build_name,
         confidence::text, code_confidence::text, weapon_confidence::text, attribution_status, status, game_mode`,
      [input.sourceId, input.creatorId, input.gameMode, candidate.rawCode, candidate.normalizedCode, candidate.weaponId,
        candidate.weaponName, candidate.weaponName ? normalizeLabel(candidate.weaponName) : null,
        candidate.suggestedWeapon, candidate.buildName, candidate.buildName ? normalizeLabel(candidate.buildName) : null,
        candidate.confidence, candidate.codeConfidence, candidate.weaponConfidence, candidate.attributionStatus, candidate.status],
    );
    if (candidate.suggestedWeapon) await recordWeaponDiscovery(client, candidate.suggestedWeapon, input.sourceId);
    const stored = inserted.rows[0];
    if (stored.status === "accepted") {
      await attachVersion(client, stored.id, input.sourceId, input.creatorId, storedCandidateToParsed(stored, input.sourceType));
    }
  }

  const ignored = await client.query(
    `update extraction_candidates
     set status = 'ignored', code_confidence = 0, weapon_confidence = 0, attribution_status = 'unresolved'
     where source_content_id = $1 and reviewed_at is null
       and not (normalized_code = any($2::text[]))`,
    [input.sourceId, parsedCodes],
  );

  // Reviewed accepted candidates that are intentionally kept but no longer emitted by
  // the parser must be reattached after the source projection was cleared.
  const reviewedAccepted = await client.query<StoredCandidate>(
    `select id, raw_code, normalized_code, weapon_id, weapon_name, suggested_weapon, build_name,
       confidence::text, code_confidence::text, weapon_confidence::text, attribution_status, status, game_mode
     from extraction_candidates
     where source_content_id = $1 and status = 'accepted' and reviewed_at is not null
       and not (normalized_code = any($2::text[]))`,
    [input.sourceId, parsedCodes],
  );
  for (const stored of reviewedAccepted.rows) {
    await attachVersion(client, stored.id, input.sourceId, input.creatorId, storedCandidateToParsed(stored, input.sourceType));
  }

  const currentVersions = await client.query<{ version_id: string }>(
    "select version_id from version_sources where source_content_id = $1",
    [input.sourceId],
  );
  const affectedVersionIds = [...new Set([
    ...previousVersions.rows.map((row) => row.version_id),
    ...currentVersions.rows.map((row) => row.version_id),
  ])];
  if (affectedVersionIds.length) {
    await client.query(
      `update weapon_build_versions wbv
       set source_published_at = (
         select max(sc.published_at)
         from version_sources vs
         join source_contents sc on sc.id = vs.source_content_id
         where vs.version_id = wbv.id
       )
       where wbv.id = any($1::uuid[])`,
      [affectedVersionIds],
    );
  }

  const removedVersions = await client.query(
    `delete from weapon_build_versions wbv
     where not exists (select 1 from version_sources vs where vs.version_id = wbv.id)`,
  );
  const removedBuilds = await client.query(
    `delete from weapon_builds wb
     where not exists (select 1 from weapon_build_versions wbv where wbv.build_id = wb.id)`,
  );
  await refreshCurrentBuildVersions(client);
  return {
    candidatesFound: uniqueParsed.length,
    candidatesIgnored: ignored.rowCount ?? 0,
    versionsRemoved: removedVersions.rowCount ?? 0,
    buildsRemoved: removedBuilds.rowCount ?? 0,
  };
}

export async function persistSource(
  videoId: string,
  creatorId: string,
  sourceType: SourceType,
  externalId: string,
  rawText: string,
  sourceUrl: string,
  authorName: string | null,
  publishedAt: Date | null,
  ingestionMethod: IngestionMethod = "api",
  gameMode: GameMode = detectGameMode(rawText),
) {
  const sanitizedRawText = sanitizePostgresText(rawText);
  const sanitizedSourceUrl = sanitizePostgresText(sourceUrl);
  const sanitizedAuthorName = authorName ? sanitizePostgresText(authorName) : null;
  return transaction(async (client) => {
    const source = await client.query<{ id: string; game_mode: GameMode }>(
      `insert into source_contents (video_id, source_type, external_id, author_name, raw_text, content_hash, source_url, published_at, ingestion_method, game_mode)
       select $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
       where length(btrim($5::text)) > 0
          or exists (
            select 1 from source_contents where source_type = $2 and external_id = $3
          )
       on conflict (source_type, external_id) do update
       set raw_text = excluded.raw_text, content_hash = excluded.content_hash, source_url = excluded.source_url,
           author_name = excluded.author_name, published_at = excluded.published_at,
           ingestion_method = excluded.ingestion_method,
           game_mode = case when source_contents.game_mode_override then source_contents.game_mode else excluded.game_mode end,
           last_seen_at = now()
      returning id, game_mode`,
      [videoId, sourceType, externalId, sanitizedAuthorName, sanitizedRawText, hash(sanitizedRawText), sanitizedSourceUrl, publishedAt, ingestionMethod, gameMode],
    );
    if (!source.rows[0]) return 0;
    const reconciled = await reconcileParsedSource(client, {
      sourceId: source.rows[0].id,
      creatorId,
      sourceType,
      rawText: sanitizedRawText,
      gameMode: source.rows[0].game_mode,
    });
    return reconciled.candidatesFound;
  });
}

type StoredSourceForReparse = {
  id: string;
  creator_id: string;
  source_type: SourceType;
  raw_text: string;
  title: string;
  external_id: string;
};

type ReparseOptions = { publishedSince?: Date; externalIds?: string[] };

const reparseSourcesSql = `select sc.id, v.creator_id, sc.source_type, sc.raw_text, v.title, sc.external_id
  from source_contents sc join videos v on v.id = sc.video_id
  where sc.source_type in ('video_description', 'manual_import')
    and ($1::timestamptz is null or coalesce(sc.published_at, v.published_at, sc.first_seen_at) >= $1)
    and ($2::text[] is null or sc.external_id = any($2::text[]))
  order by coalesce(sc.published_at, v.published_at, sc.first_seen_at), sc.first_seen_at`;

async function loadReparseSources(options: ReparseOptions, client?: pg.PoolClient) {
  const values = [options.publishedSince ?? null, options.externalIds?.length ? options.externalIds : null];
  return client
    ? client.query<StoredSourceForReparse>(reparseSourcesSql, values)
    : query<StoredSourceForReparse>(reparseSourcesSql, values);
}

async function reparseStoredSource(client: pg.PoolClient, source: StoredSourceForReparse) {
  const gameMode = detectGameMode(`${source.title}\n${source.raw_text}`);
  const effectiveMode = await client.query<{ game_mode: GameMode }>(
    `update source_contents
     set game_mode = case when game_mode_override then game_mode else $2 end
     where id = $1
     returning game_mode`,
    [source.id, gameMode],
  );
  return reconcileParsedSource(client, {
    sourceId: source.id,
    creatorId: source.creator_id,
    sourceType: source.source_type,
    rawText: source.raw_text,
    gameMode: effectiveMode.rows[0].game_mode,
  });
}

function addReparseResult(total: ReconcileResult, result: ReconcileResult) {
  total.candidatesFound += result.candidatesFound;
  total.candidatesIgnored += result.candidatesIgnored;
  total.versionsRemoved += result.versionsRemoved;
  total.buildsRemoved += result.buildsRemoved;
}

export async function reparseStoredSources(options: ReparseOptions = {}) {
  const sources = await loadReparseSources(options);
  const total: ReconcileResult = { candidatesFound: 0, candidatesIgnored: 0, versionsRemoved: 0, buildsRemoved: 0 };
  for (const source of sources.rows) {
    const result = await transaction((client) => reparseStoredSource(client, source));
    addReparseResult(total, result);
  }
  return { sourcesScanned: sources.rows.length, ...total };
}

export async function reparseStoredSourcesInTransaction(client: pg.PoolClient, options: ReparseOptions = {}) {
  const sources = await loadReparseSources(options, client);
  const total: ReconcileResult = { candidatesFound: 0, candidatesIgnored: 0, versionsRemoved: 0, buildsRemoved: 0 };
  for (const source of sources.rows) addReparseResult(total, await reparseStoredSource(client, source));
  return { sourcesScanned: sources.rows.length, ...total };
}

export function shouldRunFullSweep(trigger: "manual" | "schedule" | "backfill", lastFullSweepAt: Date | null, now = new Date()) {
  return trigger === "backfill" || !lastFullSweepAt || now.getTime() - lastFullSweepAt.getTime() >= 7 * 24 * 60 * 60 * 1000;
}

export function selectIncrementalVideos<T extends { bvid: string }>(videos: T[], existingBvids: ReadonlySet<string>, fullSweep: boolean) {
  if (fullSweep) return videos.slice(0, 30);
  const selected = [...videos.filter((video) => !existingBvids.has(video.bvid)), ...videos.slice(0, 5)];
  return selected.filter((video, index) => selected.findIndex((candidate) => candidate.bvid === video.bvid) === index);
}

export async function ingestCreatorVideo(creatorId: string, item: { bvid: string; aid: number; title: string; pic?: string; description?: string; created?: number }) {
  let detail: Awaited<ReturnType<typeof getVideoDetail>>;
  let descriptionMethod: IngestionMethod = "api";
  try {
    detail = await getVideoDetail(item.bvid);
  } catch (apiError) {
    try {
      const pageDescription = await getVideoDescriptionFromPage(item.bvid);
      detail = { aid: item.aid, bvid: item.bvid, title: item.title, pic: item.pic, desc: pageDescription, pubdate: item.created };
      descriptionMethod = "page";
    } catch (pageError) {
      const riskControlError = isBilibiliRiskControlError(pageError) ? pageError
        : isBilibiliRiskControlError(apiError) ? apiError
          : null;
      if (riskControlError) throw riskControlError;
      if (item.description?.trim()) {
        detail = { aid: item.aid, bvid: item.bvid, title: item.title, pic: item.pic, desc: item.description, pubdate: item.created };
      } else {
        throw pageError instanceof Error ? pageError : apiError;
      }
    }
  }
  const sourceUrl = `https://www.bilibili.com/video/${detail.bvid}`;
  const video = await query<{ id: string }>(
    `insert into videos (creator_id, bvid, aid, title, cover_url, description, published_at, source_url)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (bvid) do update set title = excluded.title, cover_url = excluded.cover_url,
       description = excluded.description, published_at = excluded.published_at, updated_at = now()
     returning id`,
    [creatorId, detail.bvid, detail.aid, sanitizePostgresText(detail.title), detail.pic ? sanitizePostgresText(detail.pic) : null, sanitizePostgresText(detail.desc ?? ""),
      detail.pubdate ? new Date(detail.pubdate * 1000) : null, sourceUrl],
  );
  const candidatesFound = await persistSource(
    video.rows[0].id,
    creatorId,
    "video_description",
    `description:${detail.bvid}`,
    detail.desc ?? "",
    sourceUrl,
    null,
    detail.pubdate ? new Date(detail.pubdate * 1000) : null,
    descriptionMethod,
    detectGameMode(`${detail.title}\n${detail.desc ?? ""}`),
  );
  return { candidatesFound, bvid: detail.bvid };
}

export async function crawlCreator(
  creatorId: string,
  trigger: "manual" | "schedule" | "backfill" = "schedule",
  onProgress?: (result: { videosScanned: number; candidatesFound: number }) => Promise<void>,
) {
  const lockClient = await getPool().connect();
  const lockKey = `crawl:${creatorId}`;
  const locked = await lockClient.query<{ locked: boolean }>("select pg_try_advisory_lock(hashtext($1)) locked", [lockKey]);
  if (!locked.rows[0]?.locked) {
    lockClient.release();
    throw new Error("该博主已有抓取或历史回填任务正在执行");
  }
  try {
  const creatorResult = await query<{ bilibili_mid: string; last_full_sweep_at: Date | null }>(
    "select bilibili_mid::text, last_full_sweep_at from creators where id = $1 and enabled = true and deleted_at is null",
    [creatorId],
  );
  const creator = creatorResult.rows[0];
  if (!creator) throw new Error("博主不存在或已停用");
  const videos = await getLatestVideos(creator.bilibili_mid);
  const existing = await query<{ bvid: string }>("select bvid from videos where creator_id = $1", [creatorId]);
  const fullSweep = shouldRunFullSweep(trigger, creator.last_full_sweep_at);
  const targetVideos = selectIncrementalVideos(videos, new Set(existing.rows.map((row) => row.bvid)), fullSweep)
    .sort((left, right) => (left.created ?? 0) - (right.created ?? 0) || left.bvid.localeCompare(right.bvid));
  let candidates = 0;
  let videosScanned = 0;

  for (const item of targetVideos) {
    const result = await ingestCreatorVideo(creatorId, item);
    candidates += result.candidatesFound;
    videosScanned += 1;
    await onProgress?.({ videosScanned, candidatesFound: candidates });
  }
  await query(
    `update creators set last_crawled_at = now(), last_full_sweep_at = case when $2 then now() else last_full_sweep_at end,
     updated_at = now() where id = $1`,
    [creatorId, fullSweep],
  );
  return { videosScanned, candidatesFound: candidates };
  } finally {
    await lockClient.query("select pg_advisory_unlock(hashtext($1))", [lockKey]).catch(() => undefined);
    lockClient.release();
  }
}

export async function importManualText(input: { creatorId: string; rawText: string; sourceUrl?: string; authorName?: string }) {
  const creator = await query<{ id: string; name: string }>(
    "select id, name from creators where id = $1 and deleted_at is null",
    [input.creatorId],
  );
  if (!creator.rows[0]) throw new Error("请选择有效的白名单博主");

  const importId = randomUUID();
  const sourceUrl = input.sourceUrl?.trim() || `manual-import:${importId}`;
  const bvid = sourceUrl.match(/\b(BV[0-9A-Za-z]{10})\b/)?.[1] ?? `MANUAL-${importId}`;
  const existingVideo = await query<{ id: string; creator_id: string; published_at: Date | null }>(
    "select id, creator_id, published_at from videos where bvid = $1",
    [bvid],
  );
  if (existingVideo.rows[0] && existingVideo.rows[0].creator_id !== input.creatorId) throw new Error("该视频已经归属于其他白名单博主");

  const video = existingVideo.rows[0] ?? (await query<{ id: string; creator_id: string; published_at: Date | null }>(
    `insert into videos (creator_id, bvid, title, description, source_url)
     values ($1, $2, $3, $4, $5) returning id, creator_id, published_at`,
    [input.creatorId, bvid, bvid.startsWith("BV") ? `手动导入 · ${bvid}` : "手动导入文本", input.rawText, sourceUrl],
  )).rows[0];

  const candidatesFound = await persistSource(
    video.id,
    input.creatorId,
    "manual_import",
    `manual:${importId}`,
    input.rawText,
    sourceUrl,
    input.authorName ?? creator.rows[0].name,
    video.published_at,
    "manual",
  );
  return { candidatesFound, sourceId: `manual:${importId}` };
}

async function acceptCandidateWithClient(
  client: pg.PoolClient,
  candidateId: string,
  reviewerId: string,
  corrections?: { weaponName?: string; buildName?: string; gameMode?: GameMode },
) {
  const result = await client.query<{
    id: string; source_content_id: string; creator_id: string; raw_code: string; normalized_code: string;
    weapon_name: string | null; build_name: string | null; confidence: string; source_type: SourceType; game_mode: GameMode; status: string;
  }>(
    `select ec.*, sc.source_type from extraction_candidates ec join source_contents sc on sc.id = ec.source_content_id
     where ec.id = $1 for update of ec`, [candidateId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("候选记录不存在");
  if (row.status !== "pending") throw new CandidateReviewConflictError();
  const candidate: ParsedCandidate = {
    rawCode: row.raw_code,
    normalizedCode: row.normalized_code,
    weaponName: corrections?.weaponName ?? row.weapon_name,
    weaponId: null,
    suggestedWeapon: null,
    buildName: corrections?.buildName ?? row.build_name,
    confidence: Number(row.confidence),
    codeConfidence: Number(row.confidence),
    weaponConfidence: 0.99,
    attributionStatus: "resolved",
    status: "accepted",
    sourceType: row.source_type,
    gameMode: corrections?.gameMode ?? row.game_mode,
  };
  if (!candidate.weaponName || !candidate.buildName) throw new CandidateReviewValidationError("武器和方案名不能为空");
  const weapon = await client.query<{ id: string }>(
    `select w.id from weapons w
     where w.normalized_name = $1
        or exists (select 1 from weapon_aliases wa where wa.weapon_id = w.id and wa.normalized_alias = $1)
     order by (w.normalized_name = $1) desc limit 1`,
    [normalizeLabel(candidate.weaponName)],
  );
  candidate.weaponId = weapon.rows[0]?.id ?? null;
  const updated = await client.query(
    `update extraction_candidates set status = 'accepted', game_mode = $2, weapon_name = $3, normalized_weapon = $4,
     build_name = $5, normalized_build_name = $6, weapon_confidence = 0.99, attribution_status = 'resolved',
     reviewed_by = $7, weapon_id = $8, reviewed_at = now() where id = $1 and status = 'pending'`,
    [candidateId, candidate.gameMode, candidate.weaponName, normalizeLabel(candidate.weaponName), candidate.buildName, normalizeLabel(candidate.buildName), reviewerId, candidate.weaponId],
  );
  if (updated.rowCount !== 1) throw new CandidateReviewConflictError();
  await attachVersion(client, candidateId, row.source_content_id, row.creator_id, candidate);
}

export async function acceptCandidate(
  candidateId: string,
  reviewerId: string,
  corrections?: { weaponName?: string; buildName?: string; gameMode?: GameMode },
) {
  return transaction((client) => acceptCandidateWithClient(client, candidateId, reviewerId, corrections));
}

export async function acceptCandidates(candidateIds: string[], reviewerId: string) {
  const ids = [...new Set(candidateIds)].sort();
  return transaction(async (client) => {
    for (const candidateId of ids) await acceptCandidateWithClient(client, candidateId, reviewerId);
    return ids.length;
  });
}
