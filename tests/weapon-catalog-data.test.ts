import { describe, expect, it } from "vitest";
import { OFFICIAL_WEAPON_CATALOG, WEAPON_TYPES } from "../app/lib/weapon-catalog-data";
import { normalizeLabel } from "../app/lib/parser";

describe("official weapon catalog", () => {
  it("contains the 68 formal weapons available through S11", () => {
    expect(OFFICIAL_WEAPON_CATALOG).toHaveLength(68);
    expect(new Set(OFFICIAL_WEAPON_CATALOG.map((weapon) => normalizeLabel(weapon.canonicalName))).size).toBe(68);
  });

  it("has a type and dated release season for every weapon", () => {
    for (const weapon of OFFICIAL_WEAPON_CATALOG) {
      expect(WEAPON_TYPES).toContain(weapon.weaponType);
      expect(weapon.introducedSeason).toMatch(/^S(?:[1-9]|10|11) .+ · \d{4}-\d{2}-\d{2}$/);
    }
  });

  it("does not assign an alias to more than one weapon", () => {
    const owners = new Map<string, string>();
    for (const weapon of OFFICIAL_WEAPON_CATALOG) {
      for (const alias of [weapon.canonicalName, ...(weapon.aliases ?? [])]) {
        const normalized = normalizeLabel(alias);
        const owner = owners.get(normalized);
        expect(owner, `${alias} conflicts between ${owner} and ${weapon.canonicalName}`).toBeUndefined();
        owners.set(normalized, weapon.canonicalName);
      }
    }
  });

  it("keeps Marlin and lever-action labels on one canonical weapon", () => {
    const marlin = OFFICIAL_WEAPON_CATALOG.find((weapon) => weapon.canonicalName === "马林杠杆步枪");
    expect(marlin?.aliases).toEqual(expect.arrayContaining(["马林", "杠杆步枪", "Marlin"]));
  });

  it("maps the common QBZ95 shorthand to QBZ95-1", () => {
    const qbz = OFFICIAL_WEAPON_CATALOG.find((weapon) => weapon.canonicalName === "QBZ95-1");
    expect(qbz?.aliases).toContain("QBZ95");
  });

  it("uses the official S11 names while retaining common imported aliases", () => {
    const mdr = OFFICIAL_WEAPON_CATALOG.find((weapon) => weapon.canonicalName === "MDR");
    const thompson = OFFICIAL_WEAPON_CATALOG.find((weapon) => weapon.canonicalName === "汤姆逊");
    expect(mdr).toMatchObject({ weaponType: "突击步枪", introducedSeason: "S11 群星 · 2026-09-04" });
    expect(mdr?.aliases).toEqual(expect.arrayContaining(["MDR 308", "MDR308"]));
    expect(thompson).toMatchObject({ weaponType: "冲锋枪", introducedSeason: "S11 群星 · 2026-09-04" });
    expect(thompson?.aliases).toContain("Thompson");
  });
});
