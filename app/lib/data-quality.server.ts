import { credentialStatus } from "./credentials.server";
import { query } from "./db.server";
import { qualityRate, type QualityPeriodDays } from "./data-quality";
import { getGameModeIntegrity } from "./game-mode-integrity.server";
import { getWorkerReliability } from "./worker-reliability.server";

const STALE_BUILD_DAYS = 30;

type MetricRow = {
  finished_runs: string;
  successful_runs: string;
  partial_runs: string;
  failed_runs: string;
  sources: string;
  parsed_sources: string;
  actionable_candidates: string;
  auto_ingested_candidates: string;
  latest_run_at: Date | null;
  latest_source_at: Date | null;
};

type StaleBuildRow = {
  id: string;
  weapon_name: string;
  build_name: string;
  creator_name: string;
  latest_source_published_at: Date | null;
  days_without_source: number | null;
};

export async function getDataQualityDashboard(periodDays: QualityPeriodDays) {
  const [metricsResult, staleBuildsResult, worker, credential, modeIntegrity] = await Promise.all([
    query<MetricRow>(
      `select
         count(*) filter (where cr.status in ('succeeded', 'partially_succeeded', 'failed'))::text finished_runs,
         count(*) filter (where cr.status = 'succeeded')::text successful_runs,
         count(*) filter (where cr.status = 'partially_succeeded')::text partial_runs,
         count(*) filter (where cr.status = 'failed')::text failed_runs,
         (select count(*) from source_contents sc where sc.first_seen_at >= now() - ($1 || ' days')::interval)::text sources,
         (select count(*) from source_contents sc
            where sc.first_seen_at >= now() - ($1 || ' days')::interval
              and exists (select 1 from extraction_candidates ec where ec.source_content_id = sc.id))::text parsed_sources,
         (select count(*) from extraction_candidates ec
            join source_contents sc on sc.id = ec.source_content_id
            where sc.first_seen_at >= now() - ($1 || ' days')::interval
              and ec.status in ('accepted', 'pending', 'rejected'))::text actionable_candidates,
         (select count(*) from extraction_candidates ec
            join source_contents sc on sc.id = ec.source_content_id
            where sc.first_seen_at >= now() - ($1 || ' days')::interval
              and ec.status = 'accepted' and ec.reviewed_at is null)::text auto_ingested_candidates,
         max(cr.created_at) latest_run_at,
         (select max(sc.first_seen_at) from source_contents sc) latest_source_at
       from crawl_runs cr
       where cr.created_at >= now() - ($1 || ' days')::interval`,
      [periodDays],
    ),
    query<StaleBuildRow>(
      `select wb.id, wb.weapon_name, wb.build_name, c.name creator_name,
              wb.latest_source_published_at,
              extract(day from now() - wb.latest_source_published_at)::integer days_without_source
       from weapon_builds wb
       join creators c on c.id = wb.creator_id
       where wb.latest_source_published_at is null
          or wb.latest_source_published_at < now() - ($1 || ' days')::interval
       order by wb.latest_source_published_at asc nulls first, wb.weapon_name, wb.build_name`,
      [STALE_BUILD_DAYS],
    ),
    getWorkerReliability(),
    credentialStatus(),
    getGameModeIntegrity(),
  ]);

  const row = metricsResult.rows[0];
  const finishedRuns = Number(row?.finished_runs ?? 0);
  const successfulRuns = Number(row?.successful_runs ?? 0);
  const partialRuns = Number(row?.partial_runs ?? 0);
  const failedRuns = Number(row?.failed_runs ?? 0);
  const sources = Number(row?.sources ?? 0);
  const parsedSources = Number(row?.parsed_sources ?? 0);
  const actionableCandidates = Number(row?.actionable_candidates ?? 0);
  const autoIngestedCandidates = Number(row?.auto_ingested_candidates ?? 0);

  return {
    capturedAt: new Date().toISOString(),
    periodDays,
    staleBuildDays: STALE_BUILD_DAYS,
    latestObservedAt: [row?.latest_run_at, row?.latest_source_at]
      .filter((value): value is Date => Boolean(value))
      .sort((left, right) => right.getTime() - left.getTime())[0]?.toISOString() ?? null,
    crawl: {
      rate: qualityRate(successfulRuns, finishedRuns),
      finishedRuns,
      successfulRuns,
      partialRuns,
      failedRuns,
    },
    parsing: {
      rate: qualityRate(parsedSources, sources),
      sources,
      parsedSources,
    },
    autoIngest: {
      rate: qualityRate(autoIngestedCandidates, actionableCandidates),
      actionableCandidates,
      autoIngestedCandidates,
    },
    staleBuilds: staleBuildsResult.rows.map((build) => ({
      id: build.id,
      weaponName: build.weapon_name,
      buildName: build.build_name,
      creatorName: build.creator_name,
      latestSourcePublishedAt: build.latest_source_published_at?.toISOString() ?? null,
      daysWithoutSource: build.days_without_source,
    })),
    worker,
    credential,
    modeIntegrity,
  };
}
