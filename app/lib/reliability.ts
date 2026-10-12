import type { CrawlRunStatus } from "./domain";

export const WORKER_ONLINE_WINDOW_MS = 30_000;
export const STALE_RUN_WINDOW_MS = 15 * 60_000;

export type WorkerState = "online" | "offline" | "never_seen";

export function workerState(lastHeartbeatAt: Date | null, now = new Date()): WorkerState {
  if (!lastHeartbeatAt) return "never_seen";
  return now.getTime() - lastHeartbeatAt.getTime() <= WORKER_ONLINE_WINDOW_MS ? "online" : "offline";
}

export function isRunStale(status: CrawlRunStatus, heartbeatAt: Date | null, startedAt: Date | null, now = new Date()) {
  if (status !== "running") return false;
  const lastActivityAt = heartbeatAt ?? startedAt;
  return Boolean(lastActivityAt && now.getTime() - lastActivityAt.getTime() > STALE_RUN_WINDOW_MS);
}

export function retryDelaySeconds(attempt: number, riskControlled: boolean, random = Math.random()) {
  if (riskControlled) return Math.min(12 * 60 * 60, 6 * 60 * 60 + Math.floor(random * (6 * 60 * 60 + 1)));
  return Math.min(1800, 30 * 2 ** Math.max(0, attempt - 1));
}
