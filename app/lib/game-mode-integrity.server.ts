import { query } from "./db.server";
import { summarizeGameModeIntegrity } from "./game-mode-integrity";

export async function getGameModeIntegrity() {
  const result = await query<{
    unknown_sources: string;
    unknown_candidates: string;
    unknown_versions: string;
    unknown_builds: string;
    source_candidate_mismatches: string;
    version_source_mismatches: string;
    build_version_mismatches: string;
  }>(
    `select
       (select count(*) from source_contents where game_mode = 'unknown')::text unknown_sources,
       (select count(*) from extraction_candidates where game_mode = 'unknown')::text unknown_candidates,
       (select count(*) from weapon_build_versions where game_mode = 'unknown')::text unknown_versions,
       (select count(*) from weapon_builds where game_mode = 'unknown')::text unknown_builds,
       (select count(*)
        from extraction_candidates ec
        join source_contents sc on sc.id = ec.source_content_id
        where ec.status in ('accepted', 'pending')
          and ec.game_mode <> 'unknown'
          and sc.game_mode <> 'unknown'
          and ec.game_mode <> sc.game_mode)::text source_candidate_mismatches,
       (select count(distinct wbv.id)
        from weapon_build_versions wbv
        join version_sources vs on vs.version_id = wbv.id
        join source_contents sc on sc.id = vs.source_content_id
        where wbv.game_mode <> 'unknown'
          and sc.game_mode <> 'unknown'
          and wbv.game_mode <> sc.game_mode)::text version_source_mismatches,
       (select count(distinct wb.id)
        from weapon_builds wb
        join weapon_build_versions wbv on wbv.build_id = wb.id
        where wb.game_mode <> 'unknown'
          and wbv.game_mode <> 'unknown'
          and wb.game_mode <> wbv.game_mode)::text build_version_mismatches`,
  );
  const row = result.rows[0];
  return summarizeGameModeIntegrity({
    unknownSources: Number(row?.unknown_sources ?? 0),
    unknownCandidates: Number(row?.unknown_candidates ?? 0),
    unknownVersions: Number(row?.unknown_versions ?? 0),
    unknownBuilds: Number(row?.unknown_builds ?? 0),
    sourceCandidateMismatches: Number(row?.source_candidate_mismatches ?? 0),
    versionSourceMismatches: Number(row?.version_source_mismatches ?? 0),
    buildVersionMismatches: Number(row?.build_version_mismatches ?? 0),
  });
}
