import { describe, expect, it } from "vitest";
import { normalizeCode, normalizeLabel, parseWeaponCodes } from "../app/lib/parser";

const catalog = [
  { id: "k437", canonicalName: "K437", normalizedName: "K437", aliases: ["K437"], status: "confirmed" as const },
  { id: "m7", canonicalName: "M7", normalizedName: "M7", aliases: ["M7"], status: "confirmed" as const },
];

describe("三角洲改枪码解析", () => {
  it("从视频简介中识别武器、方案和改枪码", () => {
    const result = parseWeaponCodes("K437 性价比中高改32万 - 6KURTQC07FI7MVPVB9B3H", "video_description", catalog);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ weaponName: "K437", buildName: "性价比中高改32万", normalizedCode: "6KURTQC07FI7MVPVB9B3H", status: "accepted" });
    expect(result[0].confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("保留低上下文候选用于审核", () => {
    const result = parseWeaponCodes("分享 6KURTQC07FI7MVPVB9B3H", "root_comment");
    expect(result[0].status).toBe("pending");
  });

  it("新赛季未知武器进入发现队列，但改枪码本身保持高可信", () => {
    const result = parseWeaponCodes("SCAR长管高改版A 40万-6KRIIEC07FI7MVPVB9B3H", "video_description", catalog);
    expect(result[0]).toMatchObject({ weaponName: null, suggestedWeapon: "SCAR", codeConfidence: 0.99, attributionStatus: "unresolved", status: "pending" });
  });

  it("从中英混合方案名中识别 MK4", () => {
    const result = parseWeaponCodes("MK4 4.6 中口径 三连发 高爆发\n\n改枪mua\n三连发MK4腰射高改版-6KSHI880EU90O684D8QL5", "video_description", catalog);
    expect(result[0]).toMatchObject({ suggestedWeapon: "MK4", attributionStatus: "unresolved", status: "pending" });
  });

  it("从简介头部继承纯中文武器名", () => {
    const result = parseWeaponCodes("腾龙突击步枪 5.8 全距离 通用步枪 中口径\n\n改枪mua\n腾龙邪修稳导-6KTHCB007FI7MVPVB9B3H", "video_description", catalog);
    expect(result[0]).toMatchObject({ suggestedWeapon: "腾龙", attributionStatus: "unresolved", status: "pending" });
  });

  it("马林、杠杆和杠杆步枪可归属同一武器", () => {
    const malinCatalog = [...catalog, { id: "malin", canonicalName: "马林杠杆步枪", normalizedName: "马林杠杆步枪", aliases: ["马林", "杠杆", "杠杆步枪"], status: "confirmed" as const }];
    const result = parseWeaponCodes("改枪mua\n杠杆步枪双修满改（单枪）-6KVQU7O049H3TLFDHMKHO", "video_description", malinCatalog);
    expect(result[0]).toMatchObject({ weaponName: "马林杠杆步枪", attributionStatus: "resolved", status: "accepted" });
  });

  it("不会把上一行武器串到下一行的新方案", () => {
    const malinCatalog = [...catalog, { id: "malin", canonicalName: "马林杠杆步枪", normalizedName: "马林杠杆步枪", aliases: ["马林", "杠杆", "杠杆步枪"], status: "confirmed" as const }];
    const result = parseWeaponCodes("杠杆步枪双修满改-6KVQU7O049H3TLFDHMKHO\nPSG满改A-6KVR1VG049H3TLFDHMKHO", "video_description", malinCatalog);
    expect(result[0].weaponName).toBe("马林杠杆步枪");
    expect(result[1]).toMatchObject({ weaponName: null, suggestedWeapon: "PSG", attributionStatus: "unresolved" });
  });

  it("按同一行把多武器简介拆成独立归属", () => {
    const multiCatalog = [
      ...catalog,
      { id: "malin", canonicalName: "马林杠杆步枪", normalizedName: "马林杠杆步枪", aliases: ["马林", "杠杆", "杠杆步枪"], status: "confirmed" as const },
      { id: "psg", canonicalName: "PSG", normalizedName: "PSG", aliases: ["PSG", "PSG1"], status: "confirmed" as const },
      { id: "sks", canonicalName: "SKS", normalizedName: "SKS", aliases: ["SKS"], status: "confirmed" as const },
      { id: "sr25", canonicalName: "SR25", normalizedName: "SR25", aliases: ["SR25"], status: "confirmed" as const },
    ];
    const text = `连狙 精确射手步枪 马林 杠杆 PSG1 SKS SR25

改枪mua
杠杆步枪狙击型满改（副枪）-6KVQTQS049H3TLFDHMKHO
杠杆步枪双修满改（单枪）-6KVQU7O049H3TLFDHMKHO

PSG满改A（神射手+轻语）42万-6KVR1VG049H3TLFDHMKHO
PSG满改B（长枪管+死寂）42万-6KVR2N4049H3TLFDHMKHO
PSG性价比小满改37万-6KVR384049H3TLFDHMKHO

SKS顶配满改A49万-6KVRJ80049H3TLFDHMKHO
SKS顶配满改B46万-6KVRJBK049H3TLFDHMKHO

SR25常规满改-6KVRUUG0B1RRH96DI8AIT
SR25速射压制流稳定版-6KVRVIG0B1RRH96DI8AIT`;
    const result = parseWeaponCodes(text, "video_description", multiCatalog);
    expect(result).toHaveLength(9);
    expect(result.map((item) => item.weaponName)).toEqual([
      "马林杠杆步枪", "马林杠杆步枪", "PSG", "PSG", "PSG", "SKS", "SKS", "SR25", "SR25",
    ]);
    expect(result.every((item) => item.status === "accepted" && item.codeConfidence === 0.99)).toBe(true);
  });

  it("不会把连续武器名称清单误判为改枪码", () => {
    expect(parseWeaponCodes("C级野牛 UZIAKS74UCAR15M16A4", "video_description", catalog)).toEqual([]);
    expect(parseWeaponCodes("KC17QJB201M7ASVALSKS", "video_description", catalog)).toEqual([]);
  });

  it("单武器简介可从标题上下文归属无武器前缀的方案", () => {
    const dragonCatalog = [...catalog, { id: "dragon", canonicalName: "腾龙", normalizedName: "腾龙", aliases: ["腾龙"], status: "confirmed" as const }];
    const result = parseWeaponCodes("腾龙全面解析与改法教学\n\n改枪mua\n35万长枪管中改强化版-6KJS1U80EU90O684D8QL5", "video_description", dragonCatalog);
    expect(result[0]).toMatchObject({ weaponName: "腾龙", buildName: "35万长枪管中改强化版", weaponConfidence: 0.9, status: "accepted" });
  });

  it("兼容长度只进入审核，不自动入库", () => {
    const result = parseWeaponCodes("K437 测试方案-6KURTQC07FI7MVPVB9B", "video_description", catalog);
    expect(result[0]).toMatchObject({ codeConfidence: 0.6, status: "pending" });
  });

  it("第八位不是结构位 0 的兼容码只进入审核", () => {
    const result = parseWeaponCodes("K437 测试方案-6KURTQCA7FI7MVPVB9B3H", "video_description", catalog);
    expect(result[0]).toMatchObject({ codeConfidence: 0.6, status: "pending" });
  });

  it("严格结构码必须是 21 位、6 开头且第八位为 0", () => {
    const result = parseWeaponCodes("K437 测试方案-6ABCDEF0GHIJKLMN12345", "video_description", catalog);
    expect(result[0]).toMatchObject({ codeConfidence: 0.99, status: "accepted" });
  });

  it("忽略不像改枪码的普通文本", () => {
    expect(parseWeaponCodes("今天的视频很好看，感谢分享", "root_comment")).toEqual([]);
  });

  it("标准化空白和大小写", () => {
    expect(normalizeCode(" 6kurtqc07fi7mvpvb9b3h ")).toBe("6KURTQC07FI7MVPVB9B3H");
    expect(normalizeLabel("  as   val ")).toBe("AS VAL");
  });

  it("手动导入沿用相同的解析和置信度规则", () => {
    const result = parseWeaponCodes("M7 稳定压枪 - 6KURTQC07FI7MVPVB9B3H", "manual_import", catalog);
    expect(result[0]).toMatchObject({ sourceType: "manual_import", weaponName: "M7", status: "accepted" });
  });

  it("keeps the explicitly detected game mode on every candidate", () => {
    const result = parseWeaponCodes(
      "M7 黑潮方案 - 6KURTQC07FI7MVPVB9B3H",
      "video_description",
      catalog,
      "black_tide",
    );
    expect(result[0]).toMatchObject({ gameMode: "black_tide", weaponName: "M7" });
  });
});
