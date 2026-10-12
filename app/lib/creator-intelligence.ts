export const CREATOR_INTELLIGENCE_PERIOD_DAYS = 90;
export const CREATOR_ACTIVE_DAYS = 30;

export type CreatorValueSignal = "strong" | "steady" | "review" | "insufficient";

export function percentage(numerator: number, denominator: number) {
  if (denominator <= 0) return null;
  return Math.round(numerator / denominator * 1000) / 10;
}

export function weeklyFrequency(recentVideos: number, periodDays = CREATOR_INTELLIGENCE_PERIOD_DAYS) {
  if (periodDays <= 0) return 0;
  return Math.round(recentVideos / periodDays * 7 * 10) / 10;
}

export function daysSince(value: string | null, now = new Date()) {
  if (!value) return null;
  const milliseconds = now.getTime() - new Date(value).getTime();
  return Math.max(0, Math.floor(milliseconds / 86_400_000));
}

export function classifyCreatorValue(input: {
  reviewedCandidates: number;
  updateFrequency: number;
  effectiveCodeRate: number | null;
  duplicateRate: number | null;
  daysSinceActive: number | null;
}): CreatorValueSignal {
  if (input.reviewedCandidates < 5) return "insufficient";
  if (
    input.effectiveCodeRate !== null && input.effectiveCodeRate >= 50
    && (input.duplicateRate ?? 0) <= 40
    && input.updateFrequency >= 0.1
    && (input.daysSinceActive ?? Number.POSITIVE_INFINITY) <= 60
  ) return "strong";
  if (
    (input.effectiveCodeRate !== null && input.effectiveCodeRate < 25)
    || (input.duplicateRate !== null && input.duplicateRate >= 70)
    || (input.daysSinceActive !== null && input.daysSinceActive > 180)
  ) return "review";
  return "steady";
}

export function aggregateCreatorIntelligence(items: Array<{
  recentVideos: number;
  reviewedCandidates: number;
  acceptedCandidates: number;
  totalCandidates: number;
  distinctCodes: number;
  daysSinceActive: number | null;
}>, periodDays = CREATOR_INTELLIGENCE_PERIOD_DAYS) {
  const reviewedCandidates = items.reduce((sum, item) => sum + item.reviewedCandidates, 0);
  const acceptedCandidates = items.reduce((sum, item) => sum + item.acceptedCandidates, 0);
  const totalCandidates = items.reduce((sum, item) => sum + item.totalCandidates, 0);
  const distinctCodes = items.reduce((sum, item) => sum + item.distinctCodes, 0);
  return {
    activeCreators: items.filter((item) => item.daysSinceActive !== null && item.daysSinceActive <= CREATOR_ACTIVE_DAYS).length,
    averageWeeklyFrequency: items.length
      ? Math.round(items.reduce((sum, item) => sum + weeklyFrequency(item.recentVideos, periodDays), 0) / items.length * 10) / 10
      : 0,
    effectiveCodeRate: percentage(acceptedCandidates, reviewedCandidates),
    duplicateRate: percentage(Math.max(0, totalCandidates - distinctCodes), totalCandidates),
  };
}
