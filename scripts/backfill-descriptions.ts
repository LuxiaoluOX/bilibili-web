import { audit } from "../app/lib/audit.server";
import { backfillCreatorDescriptions, parseBackfillSince } from "../app/lib/backfill.server";
import { getPool, query } from "../app/lib/db.server";

function readOption(name: string) {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function readPositiveInteger(name: string, fallback: number, maximum: number) {
  const raw = readOption(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > maximum) throw new Error(`--${name} 必须是 1–${maximum} 的整数`);
  return value;
}

const sinceRaw = readOption("since");
if (!sinceRaw) throw new Error("必须提供 --since=YYYY-MM-DD，避免意外抓取全部历史视频");
const since = parseBackfillSince(sinceRaw);
const creatorMid = readOption("creator-mid");
const batchSize = readPositiveInteger("batch-size", 10, 30);
const batchDelaySeconds = readPositiveInteger("batch-delay-seconds", 30, 3_600);
const dryRun = process.argv.includes("--dry-run");

const creators = await query<{ id: string; bilibili_mid: string; name: string }>(
  `select id, bilibili_mid::text, name from creators
   where enabled = true and deleted_at is null and ($1::text is null or bilibili_mid::text = $1)
   order by created_at`,
  [creatorMid ?? null],
);
if (!creators.rows.length) throw new Error(creatorMid ? `没有找到启用的白名单博主 UID ${creatorMid}` : "没有启用的白名单博主");

console.log(JSON.stringify({ event: "backfill.started", since: since.toISOString(), creatorCount: creators.rows.length, batchSize, batchDelaySeconds, dryRun }));
let totalVideos = 0;
let totalCandidates = 0;
try {
  for (const creator of creators.rows) {
    const result = await backfillCreatorDescriptions({
      creatorId: creator.id,
      creatorMid: creator.bilibili_mid,
      creatorName: creator.name,
      since,
      batchSize,
      batchDelayMs: batchDelaySeconds * 1_000,
      dryRun,
      onProgress: (progress) => console.log(JSON.stringify({ event: "backfill.progress", ...progress })),
    });
    totalVideos += result.videosScanned;
    totalCandidates += result.candidatesFound;
    console.log(JSON.stringify({
      event: "backfill.creator.completed", creator: creator.name, mid: creator.bilibili_mid,
      pagesScanned: result.pagesScanned, totalAvailable: result.totalAvailable,
      videosMatched: result.videos.length, videosScanned: result.videosScanned,
      candidatesFound: result.candidatesFound, dryRun,
    }));
    if (!dryRun) await audit(null, "backfill.completed", "creator", creator.id, { since: since.toISOString(), videosScanned: result.videosScanned, candidatesFound: result.candidatesFound });
  }
  console.log(JSON.stringify({ event: "backfill.completed", videosScanned: totalVideos, candidatesFound: totalCandidates, dryRun }));
} finally {
  await getPool().end();
}
