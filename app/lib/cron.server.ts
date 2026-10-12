import { Cron } from "croner";

export const DEFAULT_CRON = "17 */12 * * *";
export const APP_TIMEZONE = "Asia/Shanghai" as const;

export function validateCron(expression: string) {
  try {
    const job = new Cron(expression, { timezone: APP_TIMEZONE, paused: true });
    const next = job.nextRuns(3);
    job.stop();
    return { valid: next.length > 0, nextRuns: next.map((date) => date.toISOString()) };
  } catch {
    return { valid: false, nextRuns: [] as string[] };
  }
}

export function nextCronRun(expression: string) {
  const job = new Cron(expression, { timezone: APP_TIMEZONE, paused: true });
  const next = job.nextRun();
  job.stop();
  return next;
}
