import { describe, expect, it } from "vitest";
import { normalizeQualityPeriod, qualityRate, qualityRateLabel } from "../app/lib/data-quality";

describe("data quality metric policy", () => {
  it("uses a 90-day default while accepting only supported windows", () => {
    expect(normalizeQualityPeriod(null)).toBe(90);
    expect(normalizeQualityPeriod("30")).toBe(30);
    expect(normalizeQualityPeriod("90")).toBe(90);
    expect(normalizeQualityPeriod("365")).toBe(90);
  });

  it("keeps an empty denominator unavailable instead of reporting a false zero", () => {
    expect(qualityRate(0, 0)).toBeNull();
    expect(qualityRateLabel(qualityRate(0, 0))).toBe("暂无数据");
  });

  it("rounds supported rates to one decimal place", () => {
    expect(qualityRate(2, 3)).toBe(66.7);
    expect(qualityRateLabel(qualityRate(2, 3))).toBe("66.7%");
  });
});
