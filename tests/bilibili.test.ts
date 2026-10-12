import { describe, expect, it } from "vitest";
import { BilibiliError, extractDescriptionFromVideoPage, isBilibiliRiskControlError } from "../app/lib/bilibili.server";
import { selectIncrementalVideos, shouldRunFullSweep } from "../app/lib/crawler.server";

describe("B 站低频增量与页面兜底", () => {
  it("从页面初始状态读取完整简介", () => {
    const html = `<script>window.__INITIAL_STATE__={"videoData":{"desc":"K437 方案 - 6KURTQC07FI7MVPVB9B3H"}};</script>`;
    expect(extractDescriptionFromVideoPage(html)).toBe("K437 方案 - 6KURTQC07FI7MVPVB9B3H");
  });

  it("初始状态缺失时从页面元数据读取简介", () => {
    expect(extractDescriptionFromVideoPage('<meta name="description" content="K437 &amp; M7 改枪码">')).toBe("K437 & M7 改枪码");
  });

  it("识别需要长冷却的风控错误", () => {
    expect(isBilibiliRiskControlError(new BilibiliError("风控校验失败", -352, 200))).toBe(true);
    expect(isBilibiliRiskControlError(new BilibiliError("HTTP 500", undefined, 500))).toBe(false);
  });

  it("日常只处理新增视频和最近五条", () => {
    const videos = Array.from({ length: 10 }, (_, index) => ({ bvid: `BV${index}` }));
    const existing = new Set(videos.slice(0, 8).map((video) => video.bvid));
    expect(selectIncrementalVideos(videos, existing, false).map((video) => video.bvid)).toEqual(["BV8", "BV9", "BV0", "BV1", "BV2", "BV3", "BV4"]);
  });

  it("首次与超过七天时执行完整复查", () => {
    const now = new Date("2026-08-31T00:00:00Z");
    expect(shouldRunFullSweep("backfill", now, now)).toBe(true);
    expect(shouldRunFullSweep("schedule", new Date("2026-08-23T00:00:00Z"), now)).toBe(true);
    expect(shouldRunFullSweep("schedule", new Date("2026-08-30T00:00:00Z"), now)).toBe(false);
  });
});
