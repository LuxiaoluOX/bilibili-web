import { describe, expect, it } from "vitest";
import {
  aggregateCreatorIntelligence,
  classifyCreatorValue,
  daysSince,
  percentage,
  weeklyFrequency,
} from "../app/lib/creator-intelligence";

describe("creator intelligence metrics", () => {
  it("keeps empty denominators explicit", () => {
    expect(percentage(0, 0)).toBeNull();
    expect(percentage(3, 8)).toBe(37.5);
  });

  it("normalizes update frequency to videos per week", () => {
    expect(weeklyFrequency(13, 91)).toBe(1);
    expect(weeklyFrequency(0, 90)).toBe(0);
  });

  it("classifies strong, review and insufficient signals", () => {
    expect(classifyCreatorValue({ reviewedCandidates: 12, updateFrequency: 0.5, effectiveCodeRate: 65, duplicateRate: 20, daysSinceActive: 7 })).toBe("strong");
    expect(classifyCreatorValue({ reviewedCandidates: 12, updateFrequency: 0.5, effectiveCodeRate: 20, duplicateRate: 20, daysSinceActive: 7 })).toBe("review");
    expect(classifyCreatorValue({ reviewedCandidates: 4, updateFrequency: 1, effectiveCodeRate: 80, duplicateRate: 0, daysSinceActive: 1 })).toBe("insufficient");
  });

  it("aggregates weighted rates without inventing missing data", () => {
    expect(aggregateCreatorIntelligence([
      { recentVideos: 13, reviewedCandidates: 8, acceptedCandidates: 4, totalCandidates: 10, distinctCodes: 8, daysSinceActive: 5 },
      { recentVideos: 0, reviewedCandidates: 2, acceptedCandidates: 1, totalCandidates: 2, distinctCodes: 2, daysSinceActive: null },
    ], 91)).toEqual({ activeCreators: 1, averageWeeklyFrequency: 0.5, effectiveCodeRate: 50, duplicateRate: 16.7 });
  });

  it("calculates whole active days in a stable timezone-independent way", () => {
    expect(daysSince("2026-10-10T00:00:00.000Z", new Date("2026-10-12T12:00:00.000Z"))).toBe(2);
    expect(daysSince(null)).toBeNull();
  });
});
