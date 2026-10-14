// These are wall-clock schedules in Asia/Shanghai, not elapsed-time timers.
export const SCHEDULE_OPTIONS = [
  { value: "17 * * * *", label: "每小时一次", detail: "每小时的第 17 分钟执行" },
  { value: "17 */3 * * *", label: "每 3 小时一次", detail: "每天 00:17、03:17、06:17、09:17、12:17、15:17、18:17、21:17 执行" },
  { value: "17 */6 * * *", label: "每 6 小时一次", detail: "每天 00:17、06:17、12:17、18:17 执行" },
  { value: "17 */12 * * *", label: "每 12 小时一次（默认）", detail: "每天 00:17、12:17 执行" },
  { value: "17 0 * * *", label: "每天一次", detail: "每天 00:17 执行" },
];

export function scheduleOption(cron: string) {
  return SCHEDULE_OPTIONS.find((option) => option.value === cron.trim().replace(/\s+/g, " "));
}

export function scheduleLabel(cron: string) {
  return scheduleOption(cron)?.label ?? "自定义计划";
}
