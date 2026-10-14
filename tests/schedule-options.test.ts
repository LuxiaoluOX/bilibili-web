import { describe, expect, it } from "vitest";
import { DEFAULT_CRON, validateCron } from "../app/lib/cron.server";
import { SCHEDULE_OPTIONS, scheduleLabel, scheduleOption } from "../app/lib/schedule-options";

describe("用户可读抓取计划", () => {
  it("保留现有默认计划并显示实际执行时间", () => {
    expect(scheduleOption(DEFAULT_CRON)?.detail).toBe("每天 00:17、12:17 执行");
    expect(scheduleLabel(DEFAULT_CRON)).toBe("每 12 小时一次（默认）");
  });
  it("所有快捷计划均可由现有调度器执行", () => {
    for (const option of SCHEDULE_OPTIONS) expect(validateCron(option.value).valid).toBe(true);
  });
  it("只规范空白，不把其他自定义计划当成快捷计划", () => {
    expect(scheduleOption(" 17  */12 * * * ")?.value).toBe(DEFAULT_CRON);
    expect(scheduleOption("0 */12 * * *")).toBeUndefined();
    expect(scheduleLabel("0 8 * * 1-5")).toBe("自定义计划");
  });
});
