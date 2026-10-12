import { query } from "./db.server";
import type { CandidateStatus, CrawlRunStatus, Role } from "./domain";
import type { GameMode } from "./game-modes";
import { isUuid } from "./library-api";
import { isRunStale } from "./reliability";
import type { GameSeason } from "./seasons";

export async function listGameSeasons(): Promise<GameSeason[]> {
  const result = await query<{ code: string; name: string; starts_at: Date; ends_at: Date | null }>(
    `select code, name, starts_at,
       lead(starts_at) over (order by starts_at) ends_at
     from game_seasons
     order by starts_at desc`,
  );
  return result.rows.map((row) => ({
    code: row.code,
    name: row.name,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at?.toISOString() ?? null,
  }));
}

export async function getDashboard() {
  const [stats, candidates, runs, trend] = await Promise.all([
    query<{ creators: string; videos: string; candidates: string; success: string; failed: string; confidence: string; builds: string; active_runs: string; pending_weapons: string }>(
      `select
       (select count(*) from creators where enabled and deleted_at is null)::text creators,
       (select count(*) from videos where updated_at::date = current_date)::text videos,
       (select count(*) from extraction_candidates where created_at::date = current_date)::text candidates,
       (select count(*) from extraction_candidates where status = 'accepted' and created_at::date = current_date)::text success,
       (select count(*) from crawl_runs where status = 'failed' and created_at::date = current_date)::text failed,
       coalesce((select round(avg(code_confidence)::numeric, 2) from extraction_candidates where created_at::date = current_date), 0)::text confidence,
       (select count(*) from weapon_builds)::text builds,
       (select count(*) from crawl_runs where status in ('queued', 'running'))::text active_runs,
       (select count(*) from weapon_discoveries where status = 'pending')::text pending_weapons`,
    ),
    query<{
      id: string; video_title: string; cover_url: string | null; creator_name: string; weapon_name: string | null;
      suggested_weapon: string | null; build_name: string | null; normalized_code: string; confidence: string;
      code_confidence: string; weapon_confidence: string; attribution_status: string;
      status: CandidateStatus; source_url: string; created_at: Date; game_mode: GameMode;
    }>(
      `select ec.id, v.title video_title, v.cover_url, c.name creator_name, ec.weapon_name, ec.build_name,
       ec.suggested_weapon, ec.normalized_code, ec.confidence::text, ec.code_confidence::text,
       ec.weapon_confidence::text, ec.attribution_status, ec.status, ec.game_mode, sc.source_url, ec.created_at
       from extraction_candidates ec join creators c on c.id = ec.creator_id
       join source_contents sc on sc.id = ec.source_content_id join videos v on v.id = sc.video_id
       where ec.status = 'pending' order by ec.created_at desc limit 7`,
    ),
    query<{ id: string; status: CrawlRunStatus; creator_name: string; trigger: string; videos_scanned: number; candidates_found: number; created_at: Date }>(
      `select cr.id, cr.status, c.name creator_name, cr.trigger, cr.videos_scanned, cr.candidates_found, cr.created_at
       from crawl_runs cr join creators c on c.id = cr.creator_id order by cr.created_at desc limit 4`,
    ),
    query<{ label: string; videos_scanned: string; candidates_found: string }>(
      `select to_char(days.bucket, 'MM-DD') as label,
       coalesce(sum(cr.videos_scanned), 0)::text videos_scanned,
       coalesce(sum(cr.candidates_found), 0)::text candidates_found
       from generate_series(current_date - 6, current_date, interval '1 day') as days(bucket)
       left join crawl_runs cr on cr.created_at >= days.bucket and cr.created_at < days.bucket + interval '1 day'
       group by days.bucket order by days.bucket`,
    ),
  ]);
  const row = stats.rows[0];
  return {
    stats: { creators: Number(row.creators), videos: Number(row.videos), candidates: Number(row.candidates), success: Number(row.success), failed: Number(row.failed), confidence: Number(row.confidence), builds: Number(row.builds), activeRuns: Number(row.active_runs), pendingWeapons: Number(row.pending_weapons) },
    candidates: candidates.rows.map((item) => ({ ...item, confidence: Number(item.confidence),
      codeConfidence: Number(item.code_confidence), weaponConfidence: Number(item.weapon_confidence),
      attributionStatus: item.attribution_status, gameMode: item.game_mode, createdAt: item.created_at.toISOString() })),
    runs: runs.rows.map((item) => ({ ...item, creatorName: item.creator_name, videosScanned: item.videos_scanned,
      candidatesFound: item.candidates_found, createdAt: item.created_at.toISOString() })),
    trend: trend.rows.flatMap((item) => [
      { day: item.label, type: "扫描视频", value: Number(item.videos_scanned) },
      { day: item.label, type: "候选码", value: Number(item.candidates_found) },
    ]),
  };
}

export async function listDashboardCreatorOptions() {
  const result = await query<{ id: string; bilibili_mid: string; name: string }>(
    `select id, bilibili_mid, name from creators
     where enabled and deleted_at is null order by name`,
  );
  return result.rows.map((row) => ({ id: row.id, bilibiliMid: row.bilibili_mid, name: row.name }));
}

export async function listRecentBuilds(limit = 8) {
  const result = await query<{
    id: string; creator_name: string; weapon_name: string; build_name: string; current_version: number; code: string; source_published_at: Date | null; game_mode: GameMode;
  }>(
    `select wb.id, c.name creator_name, wb.weapon_name, wb.build_name, wb.current_version, wbv.code, wb.game_mode,
       coalesce(wb.latest_source_published_at, wbv.source_published_at) source_published_at
     from weapon_builds wb join creators c on c.id = wb.creator_id
     join weapon_build_versions wbv on wbv.build_id = wb.id and wbv.version = wb.current_version
     order by source_published_at desc nulls last, wb.updated_at desc limit $1`, [limit],
  );
  return result.rows.map((row) => ({ ...row, creatorName: row.creator_name, weaponName: row.weapon_name, buildName: row.build_name,
    currentVersion: row.current_version, gameMode: row.game_mode, sourcePublishedAt: row.source_published_at?.toISOString() ?? null }));
}

export async function listCreators(search = "") {
  const result = await query<{
    id: string; bilibili_mid: string; name: string; avatar_url: string | null; enabled: boolean; schedule_mode: "inherit" | "override";
    cron_expression: string | null; next_run_at: Date | null; last_crawled_at: Date | null; created_at: Date; codes: string;
  }>(
    `select c.*, count(distinct ec.id)::text codes from creators c left join extraction_candidates ec on ec.creator_id = c.id
     where c.deleted_at is null and ($1 = '' or c.name ilike '%' || $1 || '%' or c.bilibili_mid::text like '%' || $1 || '%')
     group by c.id order by c.created_at desc`, [search],
  );
  return result.rows.map((row) => ({ ...row, bilibiliMid: row.bilibili_mid, avatarUrl: row.avatar_url, scheduleMode: row.schedule_mode,
    cronExpression: row.cron_expression, nextRunAt: row.next_run_at?.toISOString() ?? null, lastCrawledAt: row.last_crawled_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(), codes: Number(row.codes) }));
}

export type ReviewQueueFilters = {
  page?: number;
  pageSize?: number;
  search?: string;
  gameMode?: GameMode | "";
  attribution?: "" | "resolved" | "unresolved";
  confidence?: "" | "low" | "medium" | "high";
};

export async function listReviewQueue(filters: ReviewQueueFilters = {}) {
  const pageSize = Math.min(50, Math.max(10, filters.pageSize ?? 20));
  const page = Math.max(1, filters.page ?? 1);
  const offset = (page - 1) * pageSize;
  const search = filters.search?.trim() ?? "";
  const gameMode = filters.gameMode ?? "";
  const attribution = filters.attribution ?? "";
  const confidence = filters.confidence ?? "";
  const where = `ec.status = 'pending'
    and ($1 = '' or ec.game_mode = $1)
    and ($2 = '' or ($2 = 'resolved' and ec.weapon_name is not null) or ($2 = 'unresolved' and ec.weapon_name is null))
    and ($3 = ''
      or ($3 = 'low' and ec.code_confidence < 0.75)
      or ($3 = 'medium' and ec.code_confidence >= 0.75 and ec.code_confidence < 0.9)
      or ($3 = 'high' and ec.code_confidence >= 0.9))
    and ($4 = ''
      or v.title ilike '%' || $4 || '%'
      or c.name ilike '%' || $4 || '%'
      or coalesce(ec.weapon_name, ec.suggested_weapon, '') ilike '%' || $4 || '%'
      or coalesce(ec.build_name, '') ilike '%' || $4 || '%'
      or ec.normalized_code ilike '%' || $4 || '%')`;
  const values = [gameMode, attribution, confidence, search];
  const [items, total] = await Promise.all([
    query<{
      id: string; video_title: string; cover_url: string | null; creator_name: string; weapon_name: string | null;
      suggested_weapon: string | null; build_name: string | null; normalized_code: string; confidence: string;
      code_confidence: string; weapon_confidence: string; attribution_status: string;
      status: CandidateStatus; source_url: string; created_at: Date; game_mode: GameMode;
    }>(
      `select ec.id, v.title video_title, v.cover_url, c.name creator_name, ec.weapon_name, ec.build_name,
       ec.suggested_weapon, ec.normalized_code, ec.confidence::text, ec.code_confidence::text,
       ec.weapon_confidence::text, ec.attribution_status, ec.status, ec.game_mode, sc.source_url, ec.created_at
       from extraction_candidates ec
       join creators c on c.id = ec.creator_id
       join source_contents sc on sc.id = ec.source_content_id
       join videos v on v.id = sc.video_id
       where ${where}
       order by ec.created_at desc
       limit $5 offset $6`,
      [...values, pageSize, offset],
    ),
    query<{ total: string }>(
      `select count(*)::text total
       from extraction_candidates ec
       join creators c on c.id = ec.creator_id
       join source_contents sc on sc.id = ec.source_content_id
       join videos v on v.id = sc.video_id
       where ${where}`,
      values,
    ),
  ]);

  return {
    items: items.rows.map((item) => ({
      ...item,
      confidence: Number(item.confidence),
      codeConfidence: Number(item.code_confidence),
      weaponConfidence: Number(item.weapon_confidence),
      attributionStatus: item.attribution_status,
      gameMode: item.game_mode,
      createdAt: item.created_at.toISOString(),
    })),
    total: Number(total.rows[0]?.total ?? 0),
    page,
    pageSize,
  };
}

export async function listBuilds(search = "", gameMode: GameMode | "" = "") {
  const result = await query<{
    id: string; creator_name: string; weapon_name: string; build_name: string; current_version: number; code: string; source_published_at: Date | null; game_mode: GameMode;
  }>(
    `select wb.id, c.name creator_name, wb.weapon_name, wb.build_name, wb.current_version, wbv.code, wb.game_mode,
       coalesce(wb.latest_source_published_at, wbv.source_published_at) source_published_at
     from weapon_builds wb join creators c on c.id = wb.creator_id
     join weapon_build_versions wbv on wbv.build_id = wb.id and wbv.version = wb.current_version
     where ($2 = '' or wb.game_mode = $2)
       and ($1 = ''
       or wb.weapon_name ilike '%' || $1 || '%'
       or wb.build_name ilike '%' || $1 || '%'
       or wbv.code ilike '%' || $1 || '%'
       or exists (
         select 1
         from weapons w
         join weapon_aliases wa on wa.weapon_id = w.id
         where w.normalized_name = wb.normalized_weapon
           and wa.alias ilike '%' || $1 || '%'
       ))
     order by source_published_at desc nulls last, wb.updated_at desc`, [search, gameMode],
  );
  return result.rows.map((row) => ({ ...row, creatorName: row.creator_name, weaponName: row.weapon_name, buildName: row.build_name,
    currentVersion: row.current_version, gameMode: row.game_mode, sourcePublishedAt: row.source_published_at?.toISOString() ?? null }));
}

export async function getBuild(id: string) {
  if (!isUuid(id)) return null;
  const build = await query<{ id: string; creator_name: string; weapon_name: string; build_name: string; current_version: number; source_published_at: Date | null; game_mode: GameMode }>(
    `select wb.id, c.name creator_name, wb.weapon_name, wb.build_name, wb.current_version, wb.game_mode,
       wb.latest_source_published_at source_published_at
     from weapon_builds wb join creators c on c.id = wb.creator_id where wb.id = $1`, [id],
  );
  const versions = await query<{ id: string; version: number; code: string; first_seen_at: Date; last_seen_at: Date; source_published_at: Date | null; source_urls: string[]; sources: Array<{ id: string; title: string; url: string; publishedAt: string | null; firstSeenAt: string }> }>(
    `select wbv.id, wbv.version, wbv.code, wbv.first_seen_at, wbv.last_seen_at, wbv.source_published_at,
       coalesce(array_agg(distinct sc.source_url) filter (where sc.source_url is not null), '{}') source_urls,
       coalesce(jsonb_agg(distinct jsonb_build_object(
         'id', sc.id,
         'title', v.title,
         'url', sc.source_url,
         'publishedAt', sc.published_at,
         'firstSeenAt', sc.first_seen_at
       )) filter (where sc.id is not null), '[]'::jsonb) sources
     from weapon_build_versions wbv left join version_sources vs on vs.version_id = wbv.id left join source_contents sc on sc.id = vs.source_content_id
     left join videos v on v.id = sc.video_id
     where wbv.build_id = $1 group by wbv.id order by wbv.version desc`, [id],
  );
  if (!build.rows[0]) return null;
  return { ...build.rows[0], creatorName: build.rows[0].creator_name, weaponName: build.rows[0].weapon_name,
    buildName: build.rows[0].build_name, currentVersion: build.rows[0].current_version,
    gameMode: build.rows[0].game_mode, sourcePublishedAt: build.rows[0].source_published_at?.toISOString() ?? null,
    versions: versions.rows.map((row) => ({ ...row, firstSeenAt: row.first_seen_at.toISOString(), lastSeenAt: row.last_seen_at.toISOString(),
      sourcePublishedAt: row.source_published_at?.toISOString() ?? null, sourceUrls: row.source_urls,
      sources: row.sources.map((source) => ({ ...source, publishedAt: source.publishedAt ? new Date(source.publishedAt).toISOString() : null, firstSeenAt: new Date(source.firstSeenAt).toISOString() })) })) };
}

export async function listRuns() {
  const result = await query<{ id: string; creator_name: string; trigger: string; status: CrawlRunStatus; attempt: number; videos_scanned: number; candidates_found: number; error_message: string | null; available_at: Date; created_at: Date; started_at: Date | null; finished_at: Date | null; heartbeat_at: Date | null }>(
    `select cr.*, c.name creator_name from crawl_runs cr join creators c on c.id = cr.creator_id order by cr.created_at desc limit 100`,
  );
  return result.rows.map((row) => ({ ...row, creatorName: row.creator_name, videosScanned: row.videos_scanned, candidatesFound: row.candidates_found,
    errorMessage: row.error_message, availableAt: row.available_at.toISOString(), createdAt: row.created_at.toISOString(), startedAt: row.started_at?.toISOString() ?? null,
    finishedAt: row.finished_at?.toISOString() ?? null, heartbeatAt: row.heartbeat_at?.toISOString() ?? null,
    isStale: isRunStale(row.status, row.heartbeat_at, row.started_at) }));
}

export async function listUsers() {
  const result = await query<{ id: string; username: string; email: string | null; display_name: string; role: Role; is_active: boolean; created_at: Date; updated_at: Date }>(
    "select id, username, email, display_name, role, is_active, created_at, updated_at from users where deleted_at is null order by created_at",
  );
  return result.rows.map((row) => ({ ...row, displayName: row.display_name, isActive: row.is_active, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() }));
}

export async function listAuditLogs() {
  const result = await query<{ id: string; actor_name: string | null; action: string; entity_type: string; entity_id: string | null; details: Record<string, unknown>; created_at: Date }>(
    `select al.*, u.display_name actor_name from audit_logs al left join users u on u.id = al.actor_id order by al.created_at desc limit 100`,
  );
  return result.rows.map((row) => ({ ...row, actorName: row.actor_name ?? "系统", entityType: row.entity_type, entityId: row.entity_id, createdAt: row.created_at.toISOString() }));
}
