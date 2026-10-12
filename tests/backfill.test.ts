import { describe, expect, it } from "vitest";
import { orderVideosForBackfill, parseBackfillSince, splitIntoBatches } from "../app/lib/backfill.server";

describe("历史简介分批回填", () => {
  it("按 Asia/Shanghai 解释日期边界", () => {
    expect(parseBackfillSince("2026-03-01").toISOString()).toBe("2026-02-28T16:00:00.000Z");
  });

  it("仅保留边界后的内容并按发布时间从旧到新去重", () => {
    const since = parseBackfillSince("2026-03-01");
    const result = orderVideosForBackfill([
      { bvid: "BVNEW", aid: 3, title: "新", created: 1_772_380_800 },
      { bvid: "BVOLD", aid: 1, title: "旧", created: 1_772_294_399 },
      { bvid: "BVMID", aid: 2, title: "中", created: 1_772_294_400 },
      { bvid: "BVMID", aid: 2, title: "重复", created: 1_772_294_400 },
    ], since);
    expect(result.map((video) => video.bvid)).toEqual(["BVMID", "BVNEW"]);
  });

  it("使用稳定批次切分", () => {
    expect(splitIntoBatches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
