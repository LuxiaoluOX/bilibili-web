import { describe, expect, it } from "vitest";
import { DEFAULT_CRON, validateCron } from "../app/lib/cron.server";

describe("Cron 校验", () => {
  it("接受默认每十二小时计划并返回未来三次运行", () => {
    const result = validateCron(DEFAULT_CRON);
    expect(result.valid).toBe(true);
    expect(result.nextRuns).toHaveLength(3);
  });

  it("拒绝非法表达式", () => {
    expect(validateCron("not-a-cron").valid).toBe(false);
  });
});
