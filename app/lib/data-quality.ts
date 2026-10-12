export const QUALITY_PERIOD_OPTIONS = [30, 90] as const;
export type QualityPeriodDays = (typeof QUALITY_PERIOD_OPTIONS)[number];

export function normalizeQualityPeriod(value: string | null): QualityPeriodDays {
  const parsed = Number(value);
  return QUALITY_PERIOD_OPTIONS.includes(parsed as QualityPeriodDays) ? parsed as QualityPeriodDays : 90;
}

export function qualityRate(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round(numerator / denominator * 1000) / 10 : null;
}

export function qualityRateLabel(rate: number | null) {
  return rate === null ? "暂无数据" : `${rate.toFixed(1)}%`;
}
