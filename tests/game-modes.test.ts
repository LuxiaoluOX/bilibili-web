import { describe, expect, it } from "vitest";
import { CODE_GAME_MODE_OPTIONS, detectGameMode, GAME_MODE_LABELS, isCodeGameMode } from "../app/lib/game-modes";

describe("game mode detection", () => {
  it("recognizes explicit alternate modes and defaults historical codes to Operations", () => {
    expect(detectGameMode("黑潮爆破改枪教学第二期")).toBe("black_tide");
    expect(detectGameMode("全面战场新赛季配枪")).toBe("warfare");
    expect(detectGameMode("烽火地带低成本配装")).toBe("operations");
    expect(detectGameMode("M7 最新改枪码")).toBe("operations");
  });

  it("recognizes Operations economy, equipment and extraction vocabulary", () => {
    expect(detectGameMode("武器改装费低，子弹也便宜")).toBe("operations");
    expect(detectGameMode("4弹自由，绝密局对抗 5甲")).toBe("operations");
    expect(detectGameMode("35万满改，准备前往撤离点")).toBe("operations");
    expect(detectGameMode("搜打撤赛季教学，哈夫币预算配置")).toBe("operations");
  });

  it("keeps explicit alternate modes ahead of Operations vocabulary", () => {
    expect(detectGameMode("全面战场 35万改装费测试")).toBe("warfare");
    expect(detectGameMode("黑潮爆破 5甲配装教学")).toBe("black_tide");
  });

  it("keeps stable Chinese labels for every stored value", () => {
    expect(GAME_MODE_LABELS).toEqual({
      unknown: "未识别模式",
      operations: "烽火地带",
      warfare: "全面战场",
      black_tide: "黑潮爆破",
    });
  });

  it("only exposes official gunsmith namespaces in the mode switcher", () => {
    expect(CODE_GAME_MODE_OPTIONS.map((option) => option.value)).toEqual(["operations", "warfare", "black_tide"]);
    expect(isCodeGameMode("operations")).toBe(true);
    expect(isCodeGameMode("unknown")).toBe(false);
  });
});
