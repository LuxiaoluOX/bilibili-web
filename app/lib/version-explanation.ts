import { seasonForDate, type GameSeason } from "./seasons";

export type VersionEvidence = {
  id: string;
  version: number;
  code: string;
  firstSeenAt: string;
  sourcePublishedAt: string | null;
};

export type VersionExplanation = {
  versionId: string;
  previousVersion: number | null;
  previousCode: string | null;
  replacedByVersion: number | null;
  effectiveAt: string;
  seasonCode: string | null;
  isCurrent: boolean;
  carriedForward: boolean;
  kind: "initial" | "replacement";
};

function evidenceTime(version: VersionEvidence) {
  const value = version.sourcePublishedAt ?? version.firstSeenAt;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function explainBuildVersions(
  versions: VersionEvidence[],
  currentVersion: number,
  seasons: GameSeason[],
  capturedAt: string,
): VersionExplanation[] {
  const chronological = [...versions].sort((left, right) => evidenceTime(left) - evidenceTime(right) || left.version - right.version);
  const currentSeason = seasonForDate(capturedAt, seasons);
  const hasCurrentSeasonEvidence = Boolean(currentSeason && chronological.some((version) => seasonForDate(version.sourcePublishedAt, seasons)?.code === currentSeason.code));

  return chronological.map<VersionExplanation>((version, index) => {
    const previous = chronological[index - 1] ?? null;
    const replacement = chronological[index + 1] ?? null;
    const season = seasonForDate(version.sourcePublishedAt, seasons);
    const isCurrent = version.version === currentVersion;
    return {
      versionId: version.id,
      previousVersion: previous?.version ?? null,
      previousCode: previous?.code ?? null,
      replacedByVersion: replacement?.version ?? null,
      effectiveAt: version.sourcePublishedAt ?? version.firstSeenAt,
      seasonCode: season?.code ?? null,
      isCurrent,
      carriedForward: Boolean(isCurrent && currentSeason && season && currentSeason.code !== season.code && !hasCurrentSeasonEvidence),
      kind: previous ? "replacement" : "initial",
    };
  }).sort((left, right) => new Date(right.effectiveAt).getTime() - new Date(left.effectiveAt).getTime());
}
