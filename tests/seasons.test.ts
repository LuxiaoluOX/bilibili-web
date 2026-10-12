import { describe, expect, it } from "vitest";
import { effectiveSeasonForCodes, formatSeasonRange, seasonForDate, type GameSeason } from "../app/lib/seasons";

const seasons: GameSeason[] = [
  { code: "S11", name: "群星", startsAt: "2026-09-03T16:00:00.000Z", endsAt: null },
  { code: "S10", name: "裂变", startsAt: "2026-06-25T16:00:00.000Z", endsAt: "2026-09-03T16:00:00.000Z" },
  { code: "S9", name: "回声", startsAt: "2026-04-15T16:00:00.000Z", endsAt: "2026-06-25T16:00:00.000Z" },
];

describe("game seasons", () => {
  it("uses half-open ranges at a season boundary", () => {
    expect(seasonForDate("2026-09-03T15:59:59.999Z", seasons)?.code).toBe("S10");
    expect(seasonForDate("2026-09-03T16:00:00.000Z", seasons)?.code).toBe("S11");
  });

  it("returns null before the first configured season", () => {
    expect(seasonForDate("2024-01-01T00:00:00.000Z", seasons)).toBeNull();
  });

  it("formats an inclusive range for people", () => {
    expect(formatSeasonRange(seasons[1])).toBe("2026/06/26–2026/09/03");
  });

  it("uses the current season when it has codes", () => {
    expect(effectiveSeasonForCodes(seasons[1], seasons, ["S9", "S10"])?.code).toBe("S10");
  });

  it("carries forward the most recent prior season without selecting future data", () => {
    expect(effectiveSeasonForCodes(seasons[1], seasons, ["S11", "S9"])?.code).toBe("S9");
  });

  it("keeps S11 current while carrying S10 codes forward on opening day", () => {
    expect(seasonForDate("2026-09-04T02:00:00.000Z", seasons)?.code).toBe("S11");
    expect(effectiveSeasonForCodes(seasons[0], seasons, ["S9", "S10"])?.code).toBe("S10");
  });
});
