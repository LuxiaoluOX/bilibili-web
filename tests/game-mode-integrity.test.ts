import { describe, expect, it } from "vitest";
import { summarizeGameModeIntegrity } from "../app/lib/game-mode-integrity";

const clean = {
  unknownSources: 0,
  unknownCandidates: 0,
  unknownVersions: 0,
  unknownBuilds: 0,
  sourceCandidateMismatches: 0,
  versionSourceMismatches: 0,
  buildVersionMismatches: 0,
};

describe("game mode integrity summary", () => {
  it("reports a clean four-layer projection", () => {
    expect(summarizeGameModeIntegrity(clean)).toEqual({ ...clean, issueCount: 0, healthy: true });
  });

  it("counts unknown and cross-layer mismatches without hiding either class", () => {
    expect(summarizeGameModeIntegrity({
      ...clean,
      unknownSources: 2,
      sourceCandidateMismatches: 3,
      buildVersionMismatches: 1,
    })).toMatchObject({ issueCount: 6, healthy: false });
  });
});
