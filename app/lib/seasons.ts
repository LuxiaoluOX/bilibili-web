export type GameSeason = {
  code: string;
  name: string;
  startsAt: string;
  endsAt: string | null;
};

export function seasonForDate(value: string | Date | null, seasons: GameSeason[]) {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  return seasons.find((season) => {
    const start = new Date(season.startsAt).getTime();
    const end = season.endsAt ? new Date(season.endsAt).getTime() : Number.POSITIVE_INFINITY;
    return time >= start && time < end;
  }) ?? null;
}

export function seasonDisplayName(season: GameSeason) {
  return `${season.code} ${season.name}`;
}

export function effectiveSeasonForCodes(currentSeason: GameSeason | null, seasons: GameSeason[], seasonCodes: Iterable<string>) {
  if (!currentSeason) return null;
  const available = new Set(seasonCodes);
  const currentStart = new Date(currentSeason.startsAt).getTime();
  return seasons.find((season) => available.has(season.code) && new Date(season.startsAt).getTime() <= currentStart) ?? null;
}

export function formatSeasonRange(season: GameSeason) {
  const format = (value: string) => new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
  if (!season.endsAt) return `${format(season.startsAt)} 起`;
  const inclusiveEnd = new Date(new Date(season.endsAt).getTime() - 1);
  return `${format(season.startsAt)}–${format(inclusiveEnd.toISOString())}`;
}
