import type { CandidateStatus, SourceType, WeaponAttributionStatus } from "./domain";
import type { GameMode } from "./game-modes";

export type WeaponCatalogEntry = {
  id: string;
  canonicalName: string;
  normalizedName: string;
  aliases: string[];
  status: "confirmed" | "provisional" | "retired";
};

export type ParsedCandidate = {
  rawCode: string;
  normalizedCode: string;
  weaponName: string | null;
  weaponId: string | null;
  suggestedWeapon: string | null;
  buildName: string | null;
  confidence: number;
  codeConfidence: number;
  weaponConfidence: number;
  attributionStatus: WeaponAttributionStatus;
  status: CandidateStatus;
  sourceType: SourceType;
  gameMode: GameMode;
};

export function normalizeCode(value: string) {
  return value.toUpperCase().replace(/[\s_—–-]+/g, "");
}

export function normalizeLabel(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

function statusFor(
  codeConfidence: number,
  weaponConfidence: number,
  attributionStatus: WeaponAttributionStatus,
  buildName: string | null,
): CandidateStatus {
  if (codeConfidence >= 0.85 && weaponConfidence >= 0.85 && attributionStatus === "resolved" && buildName) return "accepted";
  if (codeConfidence >= 0.5) return "pending";
  return "ignored";
}

const WEAPON_TYPE_PATTERN = "(?:突击步枪|战斗步枪|冲锋枪|轻机枪|机枪|狙击步枪|精确射手步枪|霰弹枪|手枪|步枪)";
// Every current code published by the official HQ data sets is 21 characters,
// begins with 6, and uses 0 as its eighth structural character.
const CURRENT_CODE_PATTERN = /^6[A-Z0-9]{6}0[A-Z0-9]{13}$/;
const COMPATIBLE_CODE_PATTERN = /^6[A-Z0-9]{17,23}$/;

type CatalogAlias = { weapon: WeaponCatalogEntry; alias: string };

function activeCatalogAliases(catalog: WeaponCatalogEntry[]) {
  return catalog
    .filter((weapon) => weapon.status !== "retired")
    .flatMap((weapon) => {
      const aliases = new Set([weapon.canonicalName, ...weapon.aliases]);
      return [...aliases].map((alias) => ({ weapon, alias: normalizeLabel(alias) }));
    })
    .sort((left, right) => right.alias.length - left.alias.length);
}

function matchCatalogAlias(value: string, aliases: CatalogAlias[]) {
  const normalized = normalizeLabel(value);
  return aliases.find(({ alias }) => normalized.includes(alias));
}

function precedingLineInBlock(lines: string[], index: number) {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (!lines[cursor].trim()) return "";
    return lines[cursor].trim();
  }
  return "";
}

function documentWeaponHints(lines: string[]) {
  const descriptionEnd = lines.findIndex((line) => /改枪\s*mua/i.test(line));
  const descriptionLines = descriptionEnd >= 0 ? lines.slice(0, descriptionEnd) : lines.slice(0, 8);
  const hints: string[] = [];
  for (const line of descriptionLines) {
    for (const match of line.matchAll(/\b([A-Z]{1,8}[- ]?\d{1,4})\b/gi)) {
      const value = normalizeLabel(match[1]);
      if (!/^S\d+$/i.test(value)) hints.push(value);
    }
    const chinese = line.match(new RegExp(`^([\\u4e00-\\u9fff]{1,8}?)${WEAPON_TYPE_PATTERN}`));
    if (chinese?.[1] && !/^(通用|主流|全能|新型)$/.test(chinese[1])) hints.push(chinese[1]);
  }
  return [...new Set(hints)];
}

function inferSuggestedWeapon(label: string, sourceHints: string[]) {
  const cleaned = label.replace(/^[\s：:,-]+/, "").trim();
  const match = cleaned.match(/^([A-Za-z][A-Za-z0-9 .+\-]{1,14}?)(?=[\u4e00-\u9fff（(]|\s{2,}|$)/);
  if (match) {
    const value = match[1].trim().replace(/[\s-]+$/g, "");
    if (value && !/^(BILI|BV|UP|FPS)$/i.test(value)) return value.toUpperCase();
  }
  const embeddedModel = cleaned.match(/\b([A-Z]{1,8}[- ]?\d{1,4})\b/i)?.[1];
  if (embeddedModel && !/^S\d+$/i.test(embeddedModel)) return normalizeLabel(embeddedModel);
  const matchingHint = sourceHints.find((hint) => normalizeLabel(cleaned).includes(normalizeLabel(hint)));
  if (matchingHint) return matchingHint;
  if (sourceHints.length === 1) return sourceHints[0];
  return null;
}

export function parseWeaponCodes(
  text: string,
  sourceType: SourceType,
  catalog: WeaponCatalogEntry[] = [],
  gameMode: GameMode = "unknown",
): ParsedCandidate[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const sourceHints = documentWeaponHints(lines);
  const catalogAliases = activeCatalogAliases(catalog);
  const descriptionEnd = lines.findIndex((line) => /改枪\s*mua/i.test(line));
  const firstCodeLine = lines.findIndex((line) => /\b6[A-Z0-9]{17,23}\b/i.test(line));
  const headerEnd = descriptionEnd >= 0 ? descriptionEnd : firstCodeLine >= 0 ? firstCodeLine : 8;
  const headerLines = lines.slice(0, headerEnd);
  const headerWeapons = [...new Map(
    headerLines
      .flatMap((line) => {
        const normalizedLine = normalizeLabel(line);
        return catalogAliases.filter(({ alias }) => normalizedLine.includes(alias)).map(({ weapon }) => weapon);
      })
      .map((weapon) => [weapon.id, weapon]),
  ).values()];
  const found: ParsedCandidate[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const tokens = [...line.matchAll(/\b(6[A-Z0-9]{17,23})\b/gi)];
    for (const token of tokens) {
      const rawCode = token[1];
      const normalizedCode = normalizeCode(rawCode);
      if (!COMPATIBLE_CODE_PATTERN.test(normalizedCode)) continue;

      const previousLine = precedingLineInBlock(lines, index);
      const lineWithoutCode = line.replace(token[0], "");
      const labelOnCurrentLine = lineWithoutCode.replace(/[：:,-]+/g, " ").trim();
      const matchedOnCurrentLine = matchCatalogAlias(lineWithoutCode, catalogAliases);
      const matchedOnPreviousLine = !labelOnCurrentLine ? matchCatalogAlias(previousLine, catalogAliases) : undefined;
      const matchedFromSingleWeaponHeader = !matchedOnCurrentLine && !matchedOnPreviousLine && headerWeapons.length === 1
        ? catalogAliases.find(({ weapon }) => weapon.id === headerWeapons[0].id)
        : undefined;
      const matched = matchedOnCurrentLine ?? matchedOnPreviousLine ?? matchedFromSingleWeaponHeader;
      const weapon = matched?.weapon.canonicalName ?? null;
      const currentLabel = lineWithoutCode
        .replace(matchedOnCurrentLine?.alias ? new RegExp(matchedOnCurrentLine.alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : /$^/, "")
        .replace(/[：:,-]+/g, " ")
        .trim();
      const buildName = (currentLabel || previousLine.replace(matchedOnPreviousLine?.alias ?? "", "").trim()) || null;
      const suggestedWeapon = matched ? null : inferSuggestedWeapon(lineWithoutCode, sourceHints);
      const codeConfidence = CURRENT_CODE_PATTERN.test(normalizedCode) ? 0.99 : 0.6;
      const attributionStatus: WeaponAttributionStatus = matched?.weapon.status === "confirmed" ? "resolved" : matched ? "provisional" : "unresolved";
      const weaponConfidence = matched?.weapon.status === "confirmed"
        ? matchedFromSingleWeaponHeader ? 0.9 : 0.99
        : matched ? 0.75
          : suggestedWeapon ? 0.6 : 0;

      found.push({
        rawCode,
        normalizedCode,
        weaponName: weapon === "ASVAL" ? "AS VAL" : weapon,
        weaponId: matched?.weapon.id ?? null,
        suggestedWeapon,
        buildName,
        confidence: codeConfidence,
        codeConfidence,
        weaponConfidence,
        attributionStatus,
        status: statusFor(codeConfidence, weaponConfidence, attributionStatus, buildName),
        sourceType,
        gameMode,
      });
    }
  }

  return found;
}
