import { query, transaction } from "./db.server";
import { audit } from "./audit.server";

export class CreatorUnavailableError extends Error {
  constructor() {
    super("博主不存在或已停用");
    this.name = "CreatorUnavailableError";
  }
}

export async function enqueueCrawl(creatorId: string, trigger: "manual" | "schedule" | "backfill", userId: string | null = null) {
  const run = await transaction(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`crawl-enqueue:${creatorId}`]);
    const creator = await client.query<{ id: string }>(
      "select id from creators where id = $1 and enabled = true and deleted_at is null for update",
      [creatorId],
    );
    if (!creator.rows[0]) throw new CreatorUnavailableError();
    const active = await client.query<{ id: string }>(
      "select id from crawl_runs where creator_id = $1 and status in ('queued', 'running') limit 1",
      [creatorId],
    );
    if (active.rows[0]) return { id: active.rows[0].id, created: false };
    const inserted = await client.query<{ id: string }>(
      "insert into crawl_runs (creator_id, trigger, requested_by) values ($1, $2, $3) returning id",
      [creatorId, trigger, userId],
    );
    return { id: inserted.rows[0].id, created: true };
  });
  if (run.created) await audit(userId, "crawl.enqueued", "crawl_run", run.id, { creatorId, trigger });
  return run;
}

export async function cancelQueuedCrawls(creatorId: string, userId: string) {
  await query("update crawl_runs set status = 'cancelled', finished_at = now() where creator_id = $1 and status = 'queued'", [creatorId]);
  await audit(userId, "crawl.cancelled", "creator", creatorId);
}
