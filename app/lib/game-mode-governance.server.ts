import type pg from "pg";
import { transaction } from "./db.server";
import type { CodeGameMode } from "./game-modes";

type BuildRow = {
  id: string;
  creator_id: string;
  normalized_weapon: string;
  normalized_build_name: string;
};

async function markBuildCandidates(client: pg.PoolClient, buildId: string, gameMode: CodeGameMode) {
  await client.query(
    `update extraction_candidates ec
     set game_mode = $2, game_mode_override = true
     where ec.game_mode = 'unknown'
       and (
         exists (
           select 1 from weapon_build_versions wbv
           where wbv.created_from_candidate_id = ec.id and wbv.build_id = $1
         )
         or exists (
           select 1
           from weapon_build_versions wbv
           join version_sources vs on vs.version_id = wbv.id
           where wbv.build_id = $1
             and vs.source_content_id = ec.source_content_id
             and wbv.code = ec.normalized_code
         )
       )`,
    [buildId, gameMode],
  );
}

async function mergeBuild(
  client: pg.PoolClient,
  sourceBuildId: string,
  targetBuildId: string,
  gameMode: CodeGameMode,
) {
  const versions = await client.query<{
    id: string;
    code: string;
    first_seen_at: Date;
    last_seen_at: Date;
    source_published_at: Date | null;
  }>(
    `select id, code, first_seen_at, last_seen_at, source_published_at
     from weapon_build_versions where build_id = $1 order by version, id for update`,
    [sourceBuildId],
  );

  for (const version of versions.rows) {
    const existing = await client.query<{ id: string }>(
      "select id from weapon_build_versions where build_id = $1 and code = $2 for update",
      [targetBuildId, version.code],
    );
    const existingId = existing.rows[0]?.id;
    if (existingId) {
      await client.query(
        `insert into version_sources (version_id, source_content_id, first_seen_at, last_seen_at)
         select $2, source_content_id, first_seen_at, last_seen_at
         from version_sources where version_id = $1
         on conflict (version_id, source_content_id) do update
         set first_seen_at = least(version_sources.first_seen_at, excluded.first_seen_at),
             last_seen_at = greatest(version_sources.last_seen_at, excluded.last_seen_at)`,
        [version.id, existingId],
      );
      await client.query(
        `update weapon_build_versions
         set first_seen_at = least(first_seen_at, $2),
             last_seen_at = greatest(last_seen_at, $3),
             source_published_at = greatest(source_published_at, $4)
         where id = $1`,
        [existingId, version.first_seen_at, version.last_seen_at, version.source_published_at],
      );
      await client.query("delete from weapon_build_versions where id = $1", [version.id]);
      continue;
    }

    const next = await client.query<{ version: number }>(
      "select coalesce(max(version), 0)::integer + 1 version from weapon_build_versions where build_id = $1",
      [targetBuildId],
    );
    await client.query(
      "update weapon_build_versions set build_id = $2, game_mode = $3, version = $4 where id = $1",
      [version.id, targetBuildId, gameMode, next.rows[0].version],
    );
  }

  await client.query("delete from weapon_builds where id = $1", [sourceBuildId]);
}

export async function assignUnknownBuildsToMode(buildIds: string[], gameMode: CodeGameMode) {
  if (!buildIds.length) return 0;

  return transaction(async (client) => {
    const selected = await client.query<BuildRow>(
      `select id, creator_id, normalized_weapon, normalized_build_name
       from weapon_builds
       where id = any($1::uuid[]) and game_mode = 'unknown'
       order by id
       for update`,
      [buildIds],
    );
    if (!selected.rows.length) return 0;

    const affectedSources = await client.query<{ id: string }>(
      `select distinct vs.source_content_id id
       from weapon_build_versions wbv
       join version_sources vs on vs.version_id = wbv.id
       where wbv.build_id = any($1::uuid[])`,
      [selected.rows.map((build) => build.id)],
    );

    for (const build of selected.rows) {
      const lockKey = `${build.creator_id}:${gameMode}:${build.normalized_weapon}:${build.normalized_build_name}`;
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [lockKey]);
      await markBuildCandidates(client, build.id, gameMode);

      const target = await client.query<{ id: string }>(
        `select id from weapon_builds
         where creator_id = $1 and game_mode = $2
           and normalized_weapon = $3 and normalized_build_name = $4
         for update`,
        [build.creator_id, gameMode, build.normalized_weapon, build.normalized_build_name],
      );
      if (target.rows[0]) {
        await mergeBuild(client, build.id, target.rows[0].id, gameMode);
      } else {
        await client.query("update weapon_builds set game_mode = $2, updated_at = now() where id = $1", [build.id, gameMode]);
        await client.query("update weapon_build_versions set game_mode = $2 where build_id = $1", [build.id, gameMode]);
      }
    }

    const sourceIds = affectedSources.rows.map((row) => row.id);
    if (sourceIds.length) {
      await client.query(
        `with source_modes as (
           select ec.source_content_id,
                  count(distinct ec.game_mode) mode_count,
                  max(ec.game_mode) agreed_mode
           from extraction_candidates ec
           where ec.source_content_id = any($1::uuid[])
             and ec.status in ('accepted', 'pending')
           group by ec.source_content_id
         )
         update source_contents sc
         set game_mode = case
               when sm.mode_count = 1 and sm.agreed_mode <> 'unknown' then sm.agreed_mode
               else 'unknown'
             end,
             game_mode_override = sm.mode_count = 1 and sm.agreed_mode <> 'unknown'
         from source_modes sm
         where sc.id = sm.source_content_id`,
        [sourceIds],
      );
    }

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

    return selected.rows.length;
  });
}
