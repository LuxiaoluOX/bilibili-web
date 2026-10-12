import { createHash } from "node:crypto";
import type pg from "pg";
import { audit } from "./audit.server";
import { getPool, query, transaction } from "./db.server";
import { normalizeLabel } from "./parser";
import { reparseStoredSourcesInTransaction } from "./crawler.server";
import { parseSeasonAnnouncement, type DetectedSeasonWeapon, type SeasonNewsItem } from "./season-sync-parser";

const STEAM_NEWS_URL = "https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=2507950&count=40&maxlength=0&format=json";
const SCHEDULE_INTERVAL_MS = 6 * 60 * 60 * 1000;

type SeasonSyncTrigger = "manual" | "schedule";

type StoredCandidate = {
  id: string;
  source_id: string;
  season_code: string;
  season_name: string;
  starts_at: Date;
  detected_weapons: DetectedSeasonWeapon[];
  evidence: { excerpt?: string };
  status: "pending" | "published" | "rejected" | "failed";
  created_at: Date;
  updated_at: Date;
  published_at: Date | null;
  error_message: string | null;
  title: string;
  source_url: string;
  source_published_at: Date | null;
};

function hashContent(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function seasonNumber(code: string) {
  return Number(code.replace(/^S/i, "")) || 0;
}

async function fetchSteamSeasonNews() {
  const response = await fetch(STEAM_NEWS_URL, {
    headers: { "user-agent": "SJZ-Season-Sync/1.0" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Steam 官方公告接口返回 ${response.status}`);
  const payload = await response.json() as { appnews?: { newsitems?: SeasonNewsItem[] } };
  return payload.appnews?.newsitems ?? [];
}

async function createRun(kind: "check" | "publish", trigger: SeasonSyncTrigger, actorId: string | null) {
  const result = await query<{ id: string }>(
    `insert into season_sync_runs(kind, trigger, status, requested_by)
     values($1, $2, 'running', $3) returning id`,
    [kind, trigger, actorId],
  );
  return result.rows[0].id;
}

async function finishRun(runId: string, status: "succeeded" | "no_changes" | "failed", details: {
  sourcesChecked?: number; changesFound?: number; summary?: Record<string, unknown>; error?: unknown;
}) {
  const errorMessage = details.error instanceof Error ? details.error.message : details.error ? String(details.error) : null;
  await query(
    `update season_sync_runs set status=$2, sources_checked=$3, changes_found=$4,
       summary=$5::jsonb, error_message=$6, finished_at=now() where id=$1`,
    [runId, status, details.sourcesChecked ?? 0, details.changesFound ?? 0,
      JSON.stringify(details.summary ?? {}), errorMessage?.slice(0, 1000) ?? null],
  );
}

async function withSeasonCheckLock<T>(callback: () => Promise<T>) {
  const client = await getPool().connect();
  try {
    const lock = await client.query<{ locked: boolean }>("select pg_try_advisory_lock(hashtext('season-sync-check')) locked");
    if (!lock.rows[0]?.locked) throw new Error("赛季检查正在进行，请稍后刷新");
    return await callback();
  } finally {
    await client.query("select pg_advisory_unlock(hashtext('season-sync-check'))").catch(() => undefined);
    client.release();
  }
}

async function withSeasonPublishLock<T>(candidateId: string, callback: () => Promise<T>) {
  const client = await getPool().connect();
  const lockKey = `season-sync-publish:${candidateId}`;
  try {
    await client.query("select pg_advisory_lock(hashtext($1))", [lockKey]);
    return await callback();
  } finally {
    await client.query("select pg_advisory_unlock(hashtext($1))", [lockKey]).catch(() => undefined);
    client.release();
  }
}

export async function checkSeasonUpdates(trigger: SeasonSyncTrigger, actorId: string | null = null) {
  return withSeasonCheckLock(async () => {
    const runId = await createRun("check", trigger, actorId);
    try {
      const items = await fetchSteamSeasonNews();
      const parsed = items.flatMap((item) => {
        const announcement = parseSeasonAnnouncement(item);
        return announcement ? [{ item, announcement }] : [];
      });
      const existingSeasons = await query<{ code: string }>("select code from game_seasons");
      const currentMax = Math.max(0, ...existingSeasons.rows.map((row) => seasonNumber(row.code)));
      const catalog = await query<{ normalized_name: string; normalized_alias: string | null }>(
        `select w.normalized_name, wa.normalized_alias from weapons w
         left join weapon_aliases wa on wa.weapon_id=w.id`,
      );
      const knownWeapons = new Set(catalog.rows.flatMap((row) => [row.normalized_name, row.normalized_alias].filter((value): value is string => Boolean(value))));
      let changesFound = 0;

      for (const { item, announcement } of parsed) {
        const source = await query<{ id: string }>(
          `insert into season_sync_sources(provider, external_id, title, source_url, published_at, content_hash, raw_content)
           values('steam', $1, $2, $3, $4, $5, $6)
           on conflict(provider, external_id) do update set title=excluded.title, source_url=excluded.source_url,
             published_at=excluded.published_at, content_hash=excluded.content_hash, raw_content=excluded.raw_content,
             fetched_at=now(), last_seen_at=now()
           returning id`,
          [item.gid, item.title.slice(0, 500), item.url, new Date(item.date * 1000), hashContent(item.contents), item.contents.slice(0, 150_000)],
        );
        const missingWeapons = announcement.weapons.filter((weapon) => !knownWeapons.has(normalizeLabel(weapon.canonicalName)));
        const isNewSeason = seasonNumber(announcement.seasonCode) > currentMax;
        const existingCandidate = await query(
          "select 1 from season_sync_candidates where source_id=$1 and season_code=$2",
          [source.rows[0].id, announcement.seasonCode],
        );
        if (!isNewSeason && !missingWeapons.length && !existingCandidate.rowCount) continue;
        const candidate = await query<{ changed: boolean }>(
          `insert into season_sync_candidates(source_id, season_code, season_name, starts_at, detected_weapons, evidence)
           values($1, $2, $3, $4, $5::jsonb, $6::jsonb)
           on conflict(source_id, season_code) do update set
             season_name=excluded.season_name, starts_at=excluded.starts_at,
             detected_weapons=excluded.detected_weapons, evidence=excluded.evidence,
             status='pending', reviewed_by=null, reviewed_at=null, published_at=null,
             error_message=null, updated_at=now()
           where season_sync_candidates.season_name is distinct from excluded.season_name
              or season_sync_candidates.starts_at is distinct from excluded.starts_at
              or season_sync_candidates.detected_weapons is distinct from excluded.detected_weapons
              or season_sync_candidates.evidence is distinct from excluded.evidence
           returning true changed`,
          [source.rows[0].id, announcement.seasonCode, announcement.seasonName, new Date(announcement.startsAt),
            JSON.stringify(announcement.weapons), JSON.stringify({ excerpt: announcement.evidenceExcerpt, provider: "Steam 官方公告" })],
        );
        if (candidate.rows[0]?.changed) changesFound += 1;
      }

      const status = changesFound ? "succeeded" : "no_changes";
      await finishRun(runId, status, {
        sourcesChecked: items.length,
        changesFound,
        summary: { parsedAnnouncements: parsed.length, source: "Steam 官方公告", currentSeason: `S${currentMax}` },
      });
      await audit(actorId, "season_sync.checked", "season_sync_run", runId, { trigger, sourcesChecked: items.length, changesFound });
      return { runId, sourcesChecked: items.length, parsedAnnouncements: parsed.length, changesFound };
    } catch (error) {
      await finishRun(runId, "failed", { error });
      throw error;
    }
  });
}

async function ensureWeapon(client: pg.PoolClient, weapon: DetectedSeasonWeapon, seasonLabel: string, actorId: string) {
  const normalized = normalizeLabel(weapon.canonicalName);
  const found = await client.query<{ id: string }>(
    `select w.id from weapons w left join weapon_aliases wa on wa.weapon_id=w.id
     where w.normalized_name=$1 or wa.normalized_alias=$1 limit 1`, [normalized],
  );
  let weaponId = found.rows[0]?.id;
  if (!weaponId) {
    const inserted = await client.query<{ id: string }>(
      `insert into weapons(canonical_name, normalized_name, weapon_type, introduced_season, status, created_by)
       values($1, $2, $3, $4, 'confirmed', $5) returning id`,
      [weapon.canonicalName, normalized, weapon.weaponType, seasonLabel, actorId],
    );
    weaponId = inserted.rows[0].id;
  } else {
    await client.query(
      `update weapons set weapon_type=coalesce(weapon_type,$2), introduced_season=coalesce(introduced_season,$3), updated_at=now()
       where id=$1`, [weaponId, weapon.weaponType, seasonLabel],
    );
  }
  for (const alias of new Set([weapon.canonicalName, ...weapon.aliases])) {
    await client.query(
      `insert into weapon_aliases(weapon_id, alias, normalized_alias) values($1,$2,$3)
       on conflict(normalized_alias) do nothing`, [weaponId, alias, normalizeLabel(alias)],
    );
  }
}

export async function publishSeasonCandidate(candidateId: string, actorId: string) {
  return withSeasonPublishLock(candidateId, async () => {
    const runId = await createRun("publish", "manual", actorId);
    try {
      return await transaction(async (client) => {
        const selected = await client.query<StoredCandidate>(
          `select c.*, s.title, s.source_url, s.published_at source_published_at
           from season_sync_candidates c join season_sync_sources s on s.id=c.source_id
           where c.id=$1 for update`, [candidateId],
        );
        const candidate = selected.rows[0];
        if (!candidate) throw new Error("待确认变更不存在");
        if (candidate.status !== "pending" && candidate.status !== "failed") throw new Error("该变更已经处理");
        await client.query(
          `insert into game_seasons(code,name,starts_at) values($1,$2,$3)
           on conflict(code) do update set name=excluded.name, starts_at=excluded.starts_at, updated_at=now()`,
          [candidate.season_code, candidate.season_name, candidate.starts_at],
        );
        const date = candidate.starts_at.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
        const seasonLabel = `${candidate.season_code} ${candidate.season_name} · ${date}`;
        for (const weapon of candidate.detected_weapons) await ensureWeapon(client, weapon, seasonLabel, actorId);
        const reparsed = await reparseStoredSourcesInTransaction(client, { publishedSince: candidate.starts_at });
        const result = {
          seasonCode: candidate.season_code,
          seasonName: candidate.season_name,
          weapons: candidate.detected_weapons.map((weapon) => weapon.canonicalName),
          reparsedSources: reparsed.sourcesScanned,
        };
        const published = await client.query(
          `update season_sync_candidates set status='published', reviewed_by=$2, reviewed_at=now(),
             published_at=now(), error_message=null, updated_at=now()
           where id=$1 and status in ('pending','failed')`,
          [candidateId, actorId],
        );
        if (published.rowCount !== 1) throw new Error("该变更已经处理");
        await client.query(
          `update season_sync_runs set status='succeeded', changes_found=1, summary=$2::jsonb,
             error_message=null, finished_at=now() where id=$1`,
          [runId, JSON.stringify(result)],
        );
        await client.query(
          `insert into audit_logs(actor_id, action, entity_type, entity_id, details)
           values($1, 'season_sync.published', 'season_sync_candidate', $2, $3::jsonb)`,
          [actorId, candidateId, JSON.stringify(result)],
        );
        return result;
      });
    } catch (error) {
      await query("update season_sync_candidates set status='failed', error_message=$2, updated_at=now() where id=$1 and status in ('pending','failed')", [candidateId, error instanceof Error ? error.message.slice(0, 1000) : "发布失败"]);
      await finishRun(runId, "failed", { error });
      throw error;
    }
  });
}

export async function rejectSeasonCandidate(candidateId: string, actorId: string) {
  await transaction(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`season-sync-publish:${candidateId}`]);
    const updated = await client.query(
      `update season_sync_candidates set status='rejected', reviewed_by=$2, reviewed_at=now(), updated_at=now()
       where id=$1 and status='pending'`, [candidateId, actorId],
    );
    if (!updated.rowCount) throw new Error("待确认变更不存在或已经处理");
  });
  await audit(actorId, "season_sync.rejected", "season_sync_candidate", candidateId);
}

export async function listSeasonSyncDashboard() {
  const [candidates, sources, runs, currentSeason] = await Promise.all([
    query<StoredCandidate>(
      `select c.*, s.title, s.source_url, s.published_at source_published_at
       from season_sync_candidates c join season_sync_sources s on s.id=c.source_id
       order by case c.status when 'pending' then 0 when 'failed' then 1 else 2 end, c.created_at desc limit 100`,
    ),
    query<{ id: string; provider: string; title: string; source_url: string; published_at: Date | null; fetched_at: Date; last_seen_at: Date; content_hash: string }>(
      `select id,provider,title,source_url,published_at,fetched_at,last_seen_at,content_hash
       from season_sync_sources order by published_at desc nulls last, fetched_at desc limit 100`,
    ),
    query<{ id: string; kind: string; trigger: string; status: string; sources_checked: number; changes_found: number; summary: Record<string, unknown>; error_message: string | null; started_at: Date; finished_at: Date | null; actor_name: string | null }>(
      `select r.*,u.display_name actor_name from season_sync_runs r left join users u on u.id=r.requested_by
       order by r.started_at desc limit 100`,
    ),
    query<{ code: string; name: string; starts_at: Date }>("select code,name,starts_at from game_seasons order by starts_at desc limit 1"),
  ]);
  return {
    candidates: candidates.rows.map((row) => ({
      id: row.id, seasonCode: row.season_code, seasonName: row.season_name, startsAt: row.starts_at.toISOString(),
      weapons: row.detected_weapons, evidence: row.evidence, status: row.status, sourceId: row.source_id,
      sourceTitle: row.title, sourceUrl: row.source_url, sourcePublishedAt: row.source_published_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(), publishedAt: row.published_at?.toISOString() ?? null,
      errorMessage: row.error_message,
    })),
    sources: sources.rows.map((row) => ({ ...row, publishedAt: row.published_at?.toISOString() ?? null, fetchedAt: row.fetched_at.toISOString(), lastSeenAt: row.last_seen_at.toISOString(), contentHash: row.content_hash, sourceUrl: row.source_url })),
    runs: runs.rows.map((row) => ({ id: row.id, kind: row.kind, trigger: row.trigger, status: row.status, sourcesChecked: row.sources_checked, changesFound: row.changes_found, summary: row.summary, errorMessage: row.error_message, startedAt: row.started_at.toISOString(), finishedAt: row.finished_at?.toISOString() ?? null, actorName: row.actor_name })),
    currentSeason: currentSeason.rows[0] ? { code: currentSeason.rows[0].code, name: currentSeason.rows[0].name, startsAt: currentSeason.rows[0].starts_at.toISOString() } : null,
  };
}

export async function runScheduledSeasonCheckIfDue() {
  const last = await query<{ started_at: Date }>(
    `select started_at from season_sync_runs where kind='check' and status in ('succeeded','no_changes')
     order by started_at desc limit 1`,
  );
  if (last.rows[0] && Date.now() - last.rows[0].started_at.getTime() < SCHEDULE_INTERVAL_MS) return false;
  await checkSeasonUpdates("schedule");
  return true;
}

export const seasonSyncSource = { name: "Steam 官方公告", url: STEAM_NEWS_URL, intervalHours: 6 };
