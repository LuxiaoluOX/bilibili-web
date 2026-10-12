import type { BiliVideo } from "./bilibili.server";
import { getCreatorVideosPage } from "./bilibili.server";
import { ingestCreatorVideo } from "./crawler.server";
import { getPool, query } from "./db.server";

const SHANGHAI_OFFSET = "+08:00";

export function parseBackfillSince(value: string) {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00${SHANGHAI_OFFSET}` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) throw new Error("--since 必须是 YYYY-MM-DD 或有效的 ISO 时间");
  return date;
}

export function orderVideosForBackfill(videos: BiliVideo[], since: Date) {
  const sinceSeconds = Math.floor(since.getTime() / 1000);
  return videos
    .filter((video) => typeof video.created === "number" && video.created >= sinceSeconds)
    .filter((video, index, all) => all.findIndex((candidate) => candidate.bvid === video.bvid) === index)
    .sort((left, right) => (left.created ?? 0) - (right.created ?? 0) || left.bvid.localeCompare(right.bvid));
}

export function splitIntoBatches<T>(items: T[], batchSize: number) {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error("batchSize 必须是正整数");
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += batchSize) batches.push(items.slice(index, index + batchSize));
  return batches;
}

async function collectVideosSince(mid: string, since: Date, onPage?: (page: number, matched: number, total: number) => Promise<void>) {
  const collected: BiliVideo[] = [];
  const cutoffSeconds = Math.floor(since.getTime() / 1000);
  let page = 1;
  let total = 0;

  while (page <= 1_000) {
    const result = await getCreatorVideosPage(mid, page, 30);
    total = result.total;
    if (!result.videos.length) break;
    const matched = result.videos.filter((video) => typeof video.created === "number" && video.created >= cutoffSeconds);
    collected.push(...matched);
    await onPage?.(page, matched.length, total);

    const dated = result.videos.filter((video): video is BiliVideo & { created: number } => typeof video.created === "number");
    const reachedCutoff = dated.length > 0 && dated.every((video) => video.created < cutoffSeconds);
    const reachedLastPage = total > 0 && page * result.pageSize >= total;
    if (reachedCutoff || reachedLastPage) break;
    page += 1;
  }

  return { videos: orderVideosForBackfill(collected, since), pagesScanned: page, totalAvailable: total };
}

export type BackfillProgress = {
  phase: "listing" | "ingesting" | "cooldown";
  creatorId: string;
  creatorName: string;
  page?: number;
  matched?: number;
  totalAvailable?: number;
  processed?: number;
  totalMatched?: number;
  candidatesFound?: number;
  batch?: number;
  batches?: number;
};

export async function backfillCreatorDescriptions(input: {
  creatorId: string;
  creatorMid: string;
  creatorName: string;
  since: Date;
  batchSize: number;
  batchDelayMs: number;
  dryRun?: boolean;
  onProgress?: (progress: BackfillProgress) => Promise<void> | void;
}) {
  const lockClient = await getPool().connect();
  const lockKey = `crawl:${input.creatorId}`;
  const lock = await lockClient.query<{ locked: boolean }>("select pg_try_advisory_lock(hashtext($1)) locked", [lockKey]);
  if (!lock.rows[0]?.locked) {
    lockClient.release();
    throw new Error(`${input.creatorName} 已有抓取任务正在执行`);
  }

  try {
    const active = await query<{ count: number }>(
      "select count(*)::integer count from crawl_runs where creator_id = $1 and status in ('queued', 'running')",
      [input.creatorId],
    );
    if (active.rows[0].count > 0) throw new Error(`${input.creatorName} 仍有排队或运行中的抓取任务`);

    const listing = await collectVideosSince(input.creatorMid, input.since, async (page, matched, totalAvailable) => {
      await input.onProgress?.({ phase: "listing", creatorId: input.creatorId, creatorName: input.creatorName, page, matched, totalAvailable });
    });
    if (input.dryRun) return { ...listing, videosScanned: 0, candidatesFound: 0 };

    let videosScanned = 0;
    let candidatesFound = 0;
    const batches = splitIntoBatches(listing.videos, input.batchSize);
    for (const [batchIndex, batch] of batches.entries()) {
      for (const video of batch) {
        const result = await ingestCreatorVideo(input.creatorId, video);
        videosScanned += 1;
        candidatesFound += result.candidatesFound;
        await input.onProgress?.({
          phase: "ingesting", creatorId: input.creatorId, creatorName: input.creatorName,
          processed: videosScanned, totalMatched: listing.videos.length, candidatesFound,
          batch: batchIndex + 1, batches: batches.length,
        });
      }
      if (batchIndex < batches.length - 1 && input.batchDelayMs > 0) {
        await input.onProgress?.({ phase: "cooldown", creatorId: input.creatorId, creatorName: input.creatorName, batch: batchIndex + 1, batches: batches.length });
        await new Promise((resolve) => setTimeout(resolve, input.batchDelayMs));
      }
    }
    return { ...listing, videosScanned, candidatesFound };
  } finally {
    await lockClient.query("select pg_advisory_unlock(hashtext($1))", [lockKey]).catch(() => undefined);
    lockClient.release();
  }
}
