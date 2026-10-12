export const WEAPON_TYPES = [
  "突击步枪",
  "冲锋枪",
  "狙击枪",
  "机枪",
  "精确射手步枪",
  "手枪",
  "霰弹枪",
  "特殊武器",
] as const;

export type WeaponType = (typeof WEAPON_TYPES)[number];

export type WeaponCatalogSeed = {
  canonicalName: string;
  weaponType: WeaponType;
  introducedSeason: string;
  aliases?: string[];
  /** Existing incorrect/legacy canonical rows that should be merged into this weapon. */
  mergeNames?: string[];
};

const S1 = "S1 起源 · 2024-09-26";
const S2 = "S2 聚变 · 2024-11-21";
const S3 = "S3 焰火 · 2025-01-15";
const S4 = "S4 黑夜之子 · 2025-04-17";
const S5 = "S5 破壁 · 2025-07-03";
const S6 = "S6 烈火冲天 · 2025-09-17";
const S7 = "S7 阿萨拉 · 2025-11-13";
const S8 = "S8 蝶变时刻 · 2026-01-29";
const S9 = "S9 回声 · 2026-04-16";
const S10 = "S10 裂变 · 2026-06-26";
const S11 = "S11 群星 · 2026-09-04";

/**
 * Formal live-service catalog through S11. Cosmetics and melee weapons are
 * intentionally excluded because they do not participate in build-code parsing.
 *
 * Roster: https://www.playdeltaforce.com/events/hq/
 * Later-season weapons are mapped from official season announcements. Weapons
 * not announced as a later addition are attributed to the China launch (S1).
 */
export const OFFICIAL_WEAPON_CATALOG: WeaponCatalogSeed[] = [
  { canonicalName: "QBZ95-1", weaponType: "突击步枪", introducedSeason: S1, aliases: ["QBZ951", "QBZ95", "95式"] },
  { canonicalName: "K416", weaponType: "突击步枪", introducedSeason: S1 },
  { canonicalName: "PTR-32", weaponType: "突击步枪", introducedSeason: S1, aliases: ["PTR32"], mergeNames: ["PTR32"] },
  { canonicalName: "M4A1", weaponType: "突击步枪", introducedSeason: S1 },
  { canonicalName: "AUG", weaponType: "突击步枪", introducedSeason: S1 },
  { canonicalName: "AK-12", weaponType: "突击步枪", introducedSeason: S1, aliases: ["AK12"], mergeNames: ["AK12"] },
  { canonicalName: "M16A4", weaponType: "突击步枪", introducedSeason: S1, aliases: ["M16"] },
  { canonicalName: "G3", weaponType: "突击步枪", introducedSeason: S1 },
  { canonicalName: "AKM", weaponType: "突击步枪", introducedSeason: S1 },
  { canonicalName: "CAR-15", weaponType: "突击步枪", introducedSeason: S1, aliases: ["CAR15"] },
  { canonicalName: "AKS-74", weaponType: "突击步枪", introducedSeason: S1, aliases: ["AKS74"] },
  { canonicalName: "ASh-12", weaponType: "突击步枪", introducedSeason: S1, aliases: ["ASH12"], mergeNames: ["ASH12", "ASH-12"] },
  { canonicalName: "AS VAL", weaponType: "突击步枪", introducedSeason: S1, aliases: ["ASVAL"] },
  { canonicalName: "CI-19", weaponType: "突击步枪", introducedSeason: S2, aliases: ["CI19", "191式", "腾龙"], mergeNames: ["腾龙"] },
  { canonicalName: "K437", weaponType: "突击步枪", introducedSeason: S4 },
  { canonicalName: "KC-17", weaponType: "突击步枪", introducedSeason: S5, aliases: ["KC17"], mergeNames: ["KC17"] },
  { canonicalName: "MK47", weaponType: "突击步枪", introducedSeason: S6 },
  { canonicalName: "MCX LT", weaponType: "突击步枪", introducedSeason: S8, aliases: ["MCX"], mergeNames: ["MCX"] },
  { canonicalName: "M7", weaponType: "突击步枪", introducedSeason: S1 },
  { canonicalName: "SR-3M", weaponType: "突击步枪", introducedSeason: S1, aliases: ["SR3M"], mergeNames: ["SR3M"] },
  { canonicalName: "SCAR-H", weaponType: "突击步枪", introducedSeason: S1, aliases: ["SCAR", "SCARH"], mergeNames: ["SCAR"] },
  { canonicalName: "SG552", weaponType: "突击步枪", introducedSeason: S1 },
  { canonicalName: "AR-57", weaponType: "突击步枪", introducedSeason: S9, aliases: ["AR57"], mergeNames: ["AR57"] },
  { canonicalName: "RM277", weaponType: "突击步枪", introducedSeason: S10 },
  { canonicalName: "MDR", weaponType: "突击步枪", introducedSeason: S11, aliases: ["MDR 308", "MDR308"], mergeNames: ["MDR 308", "MDR308"] },

  { canonicalName: "Bizon", weaponType: "冲锋枪", introducedSeason: S1, aliases: ["野牛"] },
  { canonicalName: "Vector", weaponType: "冲锋枪", introducedSeason: S1, aliases: ["维克托"], mergeNames: ["维克托"] },
  { canonicalName: "Vityaz", weaponType: "冲锋枪", introducedSeason: S1, aliases: ["勇士"] },
  { canonicalName: "MP5", weaponType: "冲锋枪", introducedSeason: S1 },
  { canonicalName: "UZI", weaponType: "冲锋枪", introducedSeason: S1 },
  { canonicalName: "SMG-45", weaponType: "冲锋枪", introducedSeason: S1, aliases: ["SMG45"], mergeNames: ["SMG45"] },
  { canonicalName: "P90", weaponType: "冲锋枪", introducedSeason: S1 },
  { canonicalName: "MP7", weaponType: "冲锋枪", introducedSeason: S1 },
  { canonicalName: "QCQ171", weaponType: "冲锋枪", introducedSeason: S3 },
  { canonicalName: "MK4", weaponType: "冲锋枪", introducedSeason: S7 },
  { canonicalName: "汤姆逊", weaponType: "冲锋枪", introducedSeason: S11, aliases: ["Thompson"] },

  { canonicalName: "M700", weaponType: "狙击枪", introducedSeason: S1 },
  { canonicalName: "SV-98", weaponType: "狙击枪", introducedSeason: S1, aliases: ["SV98"] },
  { canonicalName: "AWM", weaponType: "狙击枪", introducedSeason: S1 },
  { canonicalName: "R93", weaponType: "狙击枪", introducedSeason: S1 },
  { canonicalName: "M82", weaponType: "狙击枪", introducedSeason: S9 },

  { canonicalName: "M249", weaponType: "机枪", introducedSeason: S1 },
  { canonicalName: "PKM", weaponType: "机枪", introducedSeason: S1 },
  { canonicalName: "M250", weaponType: "机枪", introducedSeason: S2 },
  { canonicalName: "QJB201", weaponType: "机枪", introducedSeason: S3 },

  { canonicalName: "VSS", weaponType: "精确射手步枪", introducedSeason: S1 },
  { canonicalName: "SVD", weaponType: "精确射手步枪", introducedSeason: S1 },
  { canonicalName: "SR-25", weaponType: "精确射手步枪", introducedSeason: S1, aliases: ["SR25"], mergeNames: ["SR25"] },
  { canonicalName: "SKS", weaponType: "精确射手步枪", introducedSeason: S1 },
  { canonicalName: "PSG-1", weaponType: "精确射手步枪", introducedSeason: S1, aliases: ["PSG", "PSG1"], mergeNames: ["PSG"] },
  { canonicalName: "M14", weaponType: "精确射手步枪", introducedSeason: S1, mergeNames: ["M14BER", "M14CT"] },
  { canonicalName: "SR9", weaponType: "精确射手步枪", introducedSeason: S3 },
  { canonicalName: "马林杠杆步枪", weaponType: "精确射手步枪", introducedSeason: S6, aliases: ["马林", "杠杆", "杠杆步枪", "Marlin"] },
  { canonicalName: "Mini-14", weaponType: "精确射手步枪", introducedSeason: S1, aliases: ["Mini14"] },
  { canonicalName: "SVCH", weaponType: "精确射手步枪", introducedSeason: S10 },

  { canonicalName: "G18", weaponType: "手枪", introducedSeason: S1 },
  { canonicalName: "QSZ-92G", weaponType: "手枪", introducedSeason: S1, aliases: ["QSZ92G", "QSZ92"] },
  { canonicalName: ".357 Revolver", weaponType: "手枪", introducedSeason: S1, aliases: [".357", "357", "357左轮", ".357左轮"] },
  { canonicalName: "G17", weaponType: "手枪", introducedSeason: S1 },
  { canonicalName: "93R", weaponType: "手枪", introducedSeason: S1 },
  { canonicalName: "Desert Eagle", weaponType: "手枪", introducedSeason: S1, aliases: ["DEAGLE", "沙漠之鹰"] },
  { canonicalName: "M1911", weaponType: "手枪", introducedSeason: S2 },

  { canonicalName: "S12K", weaponType: "霰弹枪", introducedSeason: S1 },
  { canonicalName: "M1014", weaponType: "霰弹枪", introducedSeason: S1 },
  { canonicalName: "M870", weaponType: "霰弹枪", introducedSeason: S1 },
  { canonicalName: "725", weaponType: "霰弹枪", introducedSeason: S4, aliases: ["725双管"] },
  { canonicalName: "FS-12", weaponType: "霰弹枪", introducedSeason: S8, aliases: ["FS12"] },

  { canonicalName: "复合弓", weaponType: "特殊武器", introducedSeason: S5, aliases: ["Compound Bow"] },
];

export const INVALID_LEGACY_WEAPON_NAMES = ["S10"] as const;
