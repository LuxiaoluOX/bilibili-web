export type DetectedSeasonWeapon = {
  canonicalName: string;
  weaponType: string | null;
  aliases: string[];
};

export type ParsedSeasonAnnouncement = {
  seasonCode: string;
  seasonName: string;
  startsAt: string;
  weapons: DetectedSeasonWeapon[];
  evidenceExcerpt: string;
};

export type SeasonNewsItem = {
  gid: string;
  title: string;
  url: string;
  date: number;
  contents: string;
};

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

const WEAPON_TYPES: Array<[RegExp, string]> = [
  [/\b(?:assault rifle|battle rifle)\b/i, "突击步枪"],
  [/\b(?:submachine gun|smg)\b/i, "冲锋枪"],
  [/\bmarksman rifle\b/i, "精确射手步枪"],
  [/\bsniper rifle\b/i, "狙击步枪"],
  [/\blight machine gun\b|\blmg\b/i, "轻机枪"],
  [/\bshotgun\b/i, "霰弹枪"],
  [/\bpistol\b|\bhandgun\b/i, "手枪"],
  [/(?:突击步枪|战斗步枪)/, "突击步枪"],
  [/(?:冲锋枪)/, "冲锋枪"],
  [/(?:精确射手步枪|射手步枪)/, "精确射手步枪"],
  [/(?:狙击步枪|狙击枪)/, "狙击步枪"],
  [/(?:轻机枪|机枪)/, "轻机枪"],
  [/(?:霰弹枪|散弹枪)/, "霰弹枪"],
  [/(?:手枪)/, "手枪"],
];

export function steamMarkupToText(value: string) {
  return value
    .replace(/\[(?:\/)?(?:p|h\d|list|b|i|u|table|tr|td|th)(?:\s[^\]]*)?\]/gi, (tag) => /\[\/(?:p|h\d|tr|table|list)\]/i.test(tag) ? "\n" : "")
    .replace(/\[(?:img|previewyoutube|url)(?:\s[^\]]*|=[^\]]*)?\](?:[^\[]*\[\/url\])?/gi, "")
    .replace(/\[[^\]]+\]/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function seasonCodeFrom(text: string) {
  const preferred = [...text.matchAll(/\bS(\d{1,2})\s+(?:Season\s+)?(?:Mission\s+)?Update\b/gi)];
  const matches = preferred.length ? preferred : [...text.matchAll(/\bS(\d{1,2})\b/g)];
  if (!matches.length) return null;
  const highest = Math.max(...matches.map((match) => Number(match[1])));
  return Number.isFinite(highest) ? `S${highest}` : null;
}

function seasonNameFrom(title: string, text: string) {
  const inputs = [title, text.slice(0, 1200)];
  for (const input of inputs) {
    const match = input.match(/(?:new\s+season|season)\s*(?:[:：]|is)?\s*["“'「『]([^"”'」』\n]{2,40})["”'」』]/i)
      ?? input.match(/赛季\s*[「『“"]([^」』”"\n]{2,30})[」』”"]/);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function seasonStartFrom(text: string, publishedAt: Date) {
  const opening = text.slice(0, 1800);
  const chinese = opening.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日[^\n]{0,60}(?:赛季|更新|开启|上线)/)
    ?? opening.match(/(?:赛季|更新|开启|上线)[^\n]{0,60}(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/);
  if (chinese) {
    const year = Number(chinese[1] || publishedAt.getUTCFullYear());
    return `${year}-${String(Number(chinese[2])).padStart(2, "0")}-${String(Number(chinese[3])).padStart(2, "0")}T00:00:00+08:00`;
  }
  const english = opening.match(/(?:launch|opening|open|update|available)[^\n]{0,90}\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\b/i)
    ?? opening.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\b[^\n]{0,90}(?:launch|opening|open|update|available)/i);
  if (!english) return null;
  const month = MONTHS[english[1].toLowerCase()];
  return `${publishedAt.getUTCFullYear()}-${String(month).padStart(2, "0")}-${String(Number(english[2])).padStart(2, "0")}T00:00:00+08:00`;
}

function parseWeaponLabel(value: string): DetectedSeasonWeapon | null {
  const cleaned = value.replace(/^[●○■\s-]+/, "").replace(/[；;。.]$/, "").trim();
  if (!cleaned || cleaned.length > 80) return null;
  const typeMatch = WEAPON_TYPES.find(([pattern]) => pattern.test(cleaned));
  const weaponType = typeMatch?.[1] ?? null;
  const canonicalName = WEAPON_TYPES.reduce((name, [pattern]) => name.replace(pattern, ""), cleaned)
    .replace(/^(?:新增|Added|New)\s*/i, "")
    .replace(/[（）()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!canonicalName || canonicalName.length > 40) return null;
  return { canonicalName, weaponType, aliases: [canonicalName] };
}

function weaponsFrom(text: string) {
  const heading = text.match(/(?:New Weapons?|新增武器|新武器)\s*[-—–:：]\s*([^\n]{3,220})/i);
  if (!heading?.[1]) return [];
  const labels = heading[1]
    .replace(/\s+(?:and|&)\s+/gi, ",")
    .split(/[,，、；;]/)
    .map(parseWeaponLabel)
    .filter((weapon): weapon is DetectedSeasonWeapon => Boolean(weapon));
  return labels.filter((weapon, index) => labels.findIndex((item) => item.canonicalName.toUpperCase() === weapon.canonicalName.toUpperCase()) === index);
}

export function parseSeasonAnnouncement(item: SeasonNewsItem): ParsedSeasonAnnouncement | null {
  const text = steamMarkupToText(item.contents);
  const seasonCode = seasonCodeFrom(text);
  const seasonName = seasonNameFrom(item.title, text);
  const startsAt = seasonStartFrom(text, new Date(item.date * 1000));
  const weapons = weaponsFrom(text);
  if (!seasonCode || !seasonName || !startsAt) return null;
  const evidenceLine = text.split("\n").find((line) => /(?:New Weapons?|新增武器|新武器)/i.test(line));
  return {
    seasonCode,
    seasonName,
    startsAt,
    weapons,
    evidenceExcerpt: [item.title, evidenceLine].filter(Boolean).join(" · ").slice(0, 500),
  };
}
