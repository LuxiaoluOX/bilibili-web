import { crawlCreator } from "../app/lib/crawler.server";
import { isBilibiliRiskControlError } from "../app/lib/bilibili.server";
import { nextCronRun, DEFAULT_CRON } from "../app/lib/cron.server";
import { getPool, query, transaction } from "../app/lib/db.server";
import type { CrawlRunStatus } from "../app/lib/domain";
import { retryDelaySeconds } from "../app/lib/reliability";
import { runScheduledSeasonCheckIfDue } from "../app/lib/season-sync.server";
import { recoverStaleRuns } from "../app/lib/worker-reliability.server";

let stopping = false;
let nextSeasonCheckAt = 0;
let nextRecoveryCheckAt = 0;

async function scheduleDueCreators() {
  const global = await query<{ cron_expression: string }>(
    "select coalesce(value->>'cronExpression', $1) cron_expression from system_settings where key = 'global_schedule'",
    [DEFAULT_CRON],
  );
  const defaultCron = global.rows[0]?.cron_expression ?? DEFAULT_CRON;
  const due = await query<{ id: string }>(
    `select id from creators
     where enabled = true and deleted_at is null and (next_run_at is null or next_run_at <= now())`,
  );
  for (const creator of due.rows) {
    await transaction(async (client) => {
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [`crawl:${creator.id}`]);
      const current = await client.query<{ schedule_mode: string; cron_expression: string | null }>(
        `select schedule_mode, cron_expression from creators
         where id = $1 and enabled = true and deleted_at is null
           and (next_run_at is null or next_run_at <= now())
         for update`,
        [creator.id],
      );
      if (!current.rows[0]) return;
      await client.query(
        `insert into crawl_runs (creator_id, trigger)
         select $1, 'schedule' where not exists (
           select 1 from crawl_runs where creator_id = $1 and status in ('queued', 'running')
         )`, [creator.id],
      );
      const expression = current.rows[0].schedule_mode === "override" && current.rows[0].cron_expression ? current.rows[0].cron_expression : defaultCron;
      await client.query("update creators set next_run_at = $2 where id = $1", [creator.id, nextCronRun(expression)]);
    });
  }
}

async function claimRun() {
  return transaction(async (client) => {
    const selected = await client.query<{ id: string; creator_id: string; trigger: "manual" | "schedule" | "backfill"; attempt: number; max_attempts: number }>(
      `select id, creator_id, trigger, attempt, max_attempts from crawl_runs
       where status = 'queued' and available_at <= now() order by created_at
       for update skip locked limit 1`,
    );
    const run = selected.rows[0];
    if (!run) return null;
    await client.query(
      "update crawl_runs set status = 'running', attempt = attempt + 1, started_at = coalesce(started_at, now()), heartbeat_at = now(), error_message = null where id = $1",
      [run.id],
    );
    return { ...run, attempt: run.attempt + 1 };
  });
}

async function finishRun(id: string, status: CrawlRunStatus, result?: { videosScanned: number; candidatesFound: number }, error?: unknown) {
  await query(
    `update crawl_runs set status = $2, finished_at = now(), heartbeat_at = now(),
     videos_scanned = coalesce($3, videos_scanned),
     candidates_found = coalesce($4, candidates_found), error_message = $5 where id = $1`,
    [id, status, result?.videosScanned ?? null, result?.candidatesFound ?? null, error instanceof Error ? error.message.slice(0, 1000) : null],
  );
}

async function processRun() {
  const run = await claimRun();
  if (!run) return false;
  try {
    const result = await crawlCreator(run.creator_id, run.trigger, async (progress) => {
      await query(
        "update crawl_runs set videos_scanned = $2, candidates_found = $3, heartbeat_at = now() where id = $1",
        [run.id, progress.videosScanned, progress.candidatesFound],
      );
    });
    await finishRun(run.id, "succeeded", result);
  } catch (error) {
    if (run.attempt < run.max_attempts) {
      const riskControlled = isBilibiliRiskControlError(error);
      const seconds = retryDelaySeconds(run.attempt, riskControlled);
      const rawMessage = error instanceof Error ? error.message : "未知错误";
      const message = riskControlled ? `B 站风控冷却中，将在 6–12 小时后重试：${rawMessage}` : rawMessage;
      await query(
        `update crawl_runs set status = 'queued', available_at = now() + ($2 || ' seconds')::interval,
         heartbeat_at = now(), error_message = $3 where id = $1`,
        [run.id, seconds, message.slice(0, 1000)],
      );
    } else {
      await finishRun(run.id, "failed", undefined, error);
    }
  }
  return true;
}

async function heartbeat() {
  await query(
    `insert into system_settings (key, value) values ('worker_heartbeat', jsonb_build_object('at', now()))
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
  );
}

async function loop() {
  console.log("抓取 Worker 已启动");
  // A single creator backfill can take many minutes because requests are
  // deliberately rate-limited. Keep the process health signal fresh while a
  // crawl is running instead of only between queue iterations.
  const heartbeatTimer = setInterval(() => {
    void heartbeat().catch((error) => console.error(error instanceof Error ? error.message : error));
  }, 10_000);
  heartbeatTimer.unref();
  while (!stopping) {
    try {
      await heartbeat();
      if (Date.now() >= nextRecoveryCheckAt) {
        const recovered = await recoverStaleRuns();
        if (recovered.requeued || recovered.failed) {
          console.warn(`恢复卡死任务：重新排队 ${recovered.requeued} 个，标记失败 ${recovered.failed} 个`);
        }
        nextRecoveryCheckAt = Date.now() + 60_000;
      }
      if (Date.now() >= nextSeasonCheckAt) {
        try {
          await runScheduledSeasonCheckIfDue();
          nextSeasonCheckAt = Date.now() + 60 * 60 * 1000;
        } catch (error) {
          console.error(`赛季同步检查失败：${error instanceof Error ? error.message : error}`);
          nextSeasonCheckAt = Date.now() + 15 * 60 * 1000;
        }
      }
      await scheduleDueCreators();
      const worked = await processRun();
      if (!worked) await new Promise((resolve) => setTimeout(resolve, 3000));
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
  clearInterval(heartbeatTimer);
  await getPool().end();
}

process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });
await loop();
