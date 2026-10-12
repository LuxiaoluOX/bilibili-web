import { describe, expect, it } from "vitest";
import { explainBuildVersions, type VersionEvidence } from "../app/lib/version-explanation";
import type { GameSeason } from "../app/lib/seasons";

const seasons: GameSeason[] = [
  { code: "S10", name: "裂变", startsAt: "2026-06-25T16:00:00.000Z", endsAt: "2026-09-03T16:00:00.000Z" },
  { code: "S11", name: "群星", startsAt: "2026-09-03T16:00:00.000Z", endsAt: null },
];

const versions: VersionEvidence[] = [
  { id: "v2", version: 2, code: "CODE-B", firstSeenAt: "2026-08-20T00:00:00.000Z", sourcePublishedAt: "2026-08-19T00:00:00.000Z" },
  { id: "v1", version: 1, code: "CODE-A", firstSeenAt: "2026-08-01T00:00:00.000Z", sourcePublishedAt: "2026-07-31T00:00:00.000Z" },
];

describe("version change explanation", () => {
  it("builds a chronological replacement chain independent of query order", () => {
    const explanations = explainBuildVersions(versions, 2, seasons, "2026-08-25T00:00:00.000Z");
    expect(explanations[0]).toMatchObject({ versionId: "v2", previousVersion: 1, previousCode: "CODE-A", kind: "replacement", isCurrent: true });
    expect(explanations[1]).toMatchObject({ versionId: "v1", previousVersion: null, replacedByVersion: 2, kind: "initial" });
  });

  it("marks carry-forward only when the current season has no confirmed version", () => {
    expect(explainBuildVersions(versions, 2, seasons, "2026-10-12T00:00:00.000Z")[0].carriedForward).toBe(true);
    const withS11 = [...versions, { id: "v3", version: 3, code: "CODE-C", firstSeenAt: "2026-09-10T00:00:00.000Z", sourcePublishedAt: "2026-09-09T00:00:00.000Z" }];
    expect(explainBuildVersions(withS11, 3, seasons, "2026-10-12T00:00:00.000Z")[0].carriedForward).toBe(false);
  });
});
