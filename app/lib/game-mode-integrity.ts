export type GameModeIntegrityCounts = {
  unknownSources: number;
  unknownCandidates: number;
  unknownVersions: number;
  unknownBuilds: number;
  sourceCandidateMismatches: number;
  versionSourceMismatches: number;
  buildVersionMismatches: number;
};

export function summarizeGameModeIntegrity(counts: GameModeIntegrityCounts) {
  const issueCount = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return { ...counts, issueCount, healthy: issueCount === 0 };
}
