import { query } from "./db.server";
import {
  aggregateCreatorIntelligence,
  classifyCreatorValue,
  CREATOR_INTELLIGENCE_PERIOD_DAYS,
  daysSince,
  percentage,
  weeklyFrequency,
} from "./creator-intelligence";

type CreatorIntelligenceRow = {
  id: string;
  recent_videos: string;
  last_active_at: Date | null;
  total_candidates: string;
  reviewed_candidates: string;
  accepted_candidates: string;
  distinct_codes: string;
  accepted_codes: string;
  build_count: string;
};

export async function getCreatorIntelligence(search = "", periodDays = CREATOR_INTELLIGENCE_PERIOD_DAYS) {
  const result = await query<CreatorIntelligenceRow>(
    `with filtered_creators as (
       select id
       from creators
       where deleted_at is null
         and ($1 = '' or name ilike '%' || $1 || '%' or bilibili_mid::text like '%' || $1 || '%')
     ), video_stats as (
       select v.creator_id,
         count(*) filter (where v.published_at >= now() - ($2::integer * interval '1 day'))::text recent_videos,
         max(v.published_at) last_active_at
       from videos v join filtered_creators fc on fc.id = v.creator_id
       group by v.creator_id
     ), candidate_stats as (
       select ec.creator_id,
         count(*)::text total_candidates,
         count(*) filter (where ec.status <> 'pending')::text reviewed_candidates,
         count(*) filter (where ec.status = 'accepted')::text accepted_candidates,
         count(distinct ec.normalized_code)::text distinct_codes,
         count(distinct ec.normalized_code) filter (where ec.status = 'accepted')::text accepted_codes
       from extraction_candidates ec join filtered_creators fc on fc.id = ec.creator_id
       join source_contents sc on sc.id = ec.source_content_id
       join videos v on v.id = sc.video_id
       where coalesce(sc.published_at, v.published_at) >= now() - ($2::integer * interval '1 day')
       group by ec.creator_id
     ), build_stats as (
       select wb.creator_id, count(*)::text build_count
       from weapon_builds wb join filtered_creators fc on fc.id = wb.creator_id
       group by wb.creator_id
     )
     select fc.id,
       coalesce(vs.recent_videos, '0') recent_videos,
       vs.last_active_at,
       coalesce(cs.total_candidates, '0') total_candidates,
       coalesce(cs.reviewed_candidates, '0') reviewed_candidates,
       coalesce(cs.accepted_candidates, '0') accepted_candidates,
       coalesce(cs.distinct_codes, '0') distinct_codes,
       coalesce(cs.accepted_codes, '0') accepted_codes,
       coalesce(bs.build_count, '0') build_count
     from filtered_creators fc
     left join video_stats vs on vs.creator_id = fc.id
     left join candidate_stats cs on cs.creator_id = fc.id
     left join build_stats bs on bs.creator_id = fc.id`,
    [search, periodDays],
  );

  const now = new Date();
  const items = result.rows.map((row) => {
    const recentVideos = Number(row.recent_videos);
    const totalCandidates = Number(row.total_candidates);
    const reviewedCandidates = Number(row.reviewed_candidates);
    const acceptedCandidates = Number(row.accepted_candidates);
    const distinctCodes = Number(row.distinct_codes);
    const lastActiveAt = row.last_active_at?.toISOString() ?? null;
    const updateFrequency = weeklyFrequency(recentVideos, periodDays);
    const effectiveCodeRate = percentage(acceptedCandidates, reviewedCandidates);
    const duplicateRate = percentage(Math.max(0, totalCandidates - distinctCodes), totalCandidates);
    const activeDays = daysSince(lastActiveAt, now);
    return {
      id: row.id,
      recentVideos,
      lastActiveAt,
      daysSinceActive: activeDays,
      totalCandidates,
      reviewedCandidates,
      acceptedCandidates,
      distinctCodes,
      acceptedCodes: Number(row.accepted_codes),
      buildCount: Number(row.build_count),
      updateFrequency,
      effectiveCodeRate,
      duplicateRate,
      valueSignal: classifyCreatorValue({ reviewedCandidates, updateFrequency, effectiveCodeRate, duplicateRate, daysSinceActive: activeDays }),
    };
  });

  return {
    periodDays,
    items,
    summary: aggregateCreatorIntelligence(items, periodDays),
  };
}
