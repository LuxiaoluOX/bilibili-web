import { reparseStoredSources } from "../app/lib/crawler.server";
import { getPool } from "../app/lib/db.server";

const sinceArgument = process.argv.slice(2).find((value) => value.startsWith("--since="))?.slice("--since=".length);
const externalIds = process.argv.slice(2)
  .filter((value) => value.startsWith("--source="))
  .map((value) => value.slice("--source=".length))
  .filter(Boolean);
if (!externalIds.length && (!sinceArgument || !/^\d{4}-\d{2}-\d{2}$/.test(sinceArgument))) {
  throw new Error("必须提供 --since=YYYY-MM-DD 或至少一个 --source=EXTERNAL_ID，避免意外重建全部历史数据");
}
const publishedSince = sinceArgument ? new Date(`${sinceArgument}T00:00:00+08:00`) : undefined;
if (publishedSince && Number.isNaN(publishedSince.getTime())) throw new Error("--since 日期无效");

const result = await reparseStoredSources({ publishedSince, externalIds });
console.log(JSON.stringify({ event: "sources.reparsed", since: publishedSince?.toISOString() ?? null, externalIds, ...result }));
await getPool().end();
