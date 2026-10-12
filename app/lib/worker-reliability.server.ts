import { query, transaction } from "./db.server";
import { STALE_RUN_WINDOW_MS, workerState } from "./reliability";

export async function getWorkerReliability() {
  const [heartbeat, queue] = await Promise.all([
    query<{ last_heartbeat_at: Date | null }>(
      `select (value->>'at')::timestamptz last_heartbeat_at
       from system_settings where key = 'worker_heartbeat'`,
    ),
    query<{ ready_runs: string; delayed_runs: string; stale_runs: string }>(
      `select
         count(*) filter (where status = 'queued' and available_at <= now())::text ready_runs,
         count(*) filter (where status = 'queued' and available_at > now())::text delayed_runs,
         count(*) filter (
           where status = 'running'
             and coalesce(heartbeat_at, started_at, created_at) < now() - ($1 || ' milliseconds')::interval
         )::text stale_runs
       from crawl_runs`,
      [STALE_RUN_WINDOW_MS],
    ),
  ]);
  const lastHeartbeatAt = heartbeat.rows[0]?.last_heartbeat_at ?? null;
  const state = workerState(lastHeartbeatAt);
  const counts = queue.rows[0];
  return {
    state,
    online: state === "online",
    lastHeartbeatAt: lastHeartbeatAt?.toISOString() ?? null,
    readyRuns: Number(counts?.ready_runs ?? 0),
    delayedRuns: Number(counts?.delayed_runs ?? 0),
    staleRuns: Number(counts?.stale_runs ?? 0),
  };
}

export async function recoverStaleRuns() {
  return transaction(async (client) => {
    const selected = await client.query<{ id: string; attempt: number; max_attempts: number }>(
      `select id, attempt, max_attempts
       from crawl_runs
       where status = 'running'
         and coalesce(heartbeat_at, started_at, created_at) < now() - ($1 || ' milliseconds')::interval
       for update skip locked`,
      [STALE_RUN_WINDOW_MS],
    );
    const retryableIds = selected.rows.filter((run) => run.attempt < run.max_attempts).map((run) => run.id);
    const exhaustedIds = selected.rows.filter((run) => run.attempt >= run.max_attempts).map((run) => run.id);

    if (retryableIds.length) {
      await client.query(
        `update crawl_runs
         set status = 'queued', available_at = now() + interval '30 seconds',
             started_at = null, heartbeat_at = null, finished_at = null,
             error_message = 'Worker 心跳中断，任务已自动重新排队'
         where id = any($1::uuid[])`,
        [retryableIds],
      );
    }
    if (exhaustedIds.length) {
      await client.query(
        `update crawl_runs
         set status = 'failed', finished_at = now(), heartbeat_at = now(),
             error_message = 'Worker 心跳中断，且任务已达到最大尝试次数'
         where id = any($1::uuid[])`,
        [exhaustedIds],
      );
    }

    return { requeued: retryableIds.length, failed: exhaustedIds.length };
  });
}
