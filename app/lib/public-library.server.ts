import { query } from "./db.server";
import type { CodeGameMode } from "./game-modes";

export type PublicLibraryFilters = {
  search?: string;
  gameMode?: CodeGameMode | "";
  season?: string;
  creatorId?: string;
};

export async function listPublicBuilds(filters: PublicLibraryFilters = {}) {
  const search = filters.search?.trim() ?? "";
  const gameMode = filters.gameMode ?? "";
  const season = filters.season?.trim() ?? "";
  const creatorId = filters.creatorId?.trim() ?? "";
  const result = await query<{
    id: string;
    creator_name: string;
    weapon_name: string;
    build_name: string;
    current_version: number;
    code: string;
    game_mode: CodeGameMode;
    source_published_at: Date | null;
    season_code: string | null;
    source_count: number;
  }>(
    `with current_builds as (
       select wb.id, wb.creator_id, c.name creator_name, wb.weapon_name, wb.build_name,
              wb.current_version, wb.game_mode, wbv.id version_id, wbv.code,
              coalesce(wb.latest_source_published_at, wbv.source_published_at) source_published_at
       from weapon_builds wb
       join creators c on c.id = wb.creator_id
       join weapon_build_versions wbv on wbv.build_id = wb.id and wbv.version = wb.current_version
       where wb.game_mode <> 'unknown'
     ), enriched as (
       select cb.*,
              (select gs.code from game_seasons gs
               where cb.source_published_at >= gs.starts_at
               order by gs.starts_at desc limit 1) season_code,
              (select count(distinct vs.source_content_id)::int
               from version_sources vs where vs.version_id = cb.version_id) source_count
       from current_builds cb
     )
     select id, creator_name, weapon_name, build_name, current_version, code, game_mode,
            source_published_at, season_code, source_count
     from enriched
     where ($1 = ''
       or weapon_name ilike '%' || $1 || '%'
       or build_name ilike '%' || $1 || '%'
       or code ilike '%' || $1 || '%'
       or creator_name ilike '%' || $1 || '%')
       and ($2 = '' or game_mode = $2)
       and ($3 = '' or season_code = $3)
       and ($4 = '' or creator_id = $4::uuid)
     order by source_published_at desc nulls last, weapon_name, build_name`,
    [search, gameMode, season, creatorId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    creatorName: row.creator_name,
    weaponName: row.weapon_name,
    buildName: row.build_name,
    currentVersion: row.current_version,
    code: row.code,
    gameMode: row.game_mode,
    sourcePublishedAt: row.source_published_at?.toISOString() ?? null,
    seasonCode: row.season_code,
    sourceCount: row.source_count,
  }));
}

export async function listPublicCreators() {
  const result = await query<{ id: string; name: string }>(
    `select distinct c.id, c.name
     from creators c join weapon_builds wb on wb.creator_id = c.id
     where wb.game_mode <> 'unknown' and c.deleted_at is null
     order by c.name`,
  );
  return result.rows;
}
