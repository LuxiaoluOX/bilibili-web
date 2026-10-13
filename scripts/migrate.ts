import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import pg from "pg";
import { getDatabaseSchema, getPool } from "../app/lib/db.server";
import { env } from "../app/lib/env.server";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(here, "../migrations");
if (!env.DATABASE_URL) throw new Error("DATABASE_URL 未配置");
const targetUrl = new URL(env.DATABASE_URL);
const databaseName = decodeURIComponent(targetUrl.pathname.slice(1));
if (!databaseName || databaseName.includes('"')) throw new Error("数据库名称无效");
const adminUrl = new URL(targetUrl);
adminUrl.pathname = "/postgres";
adminUrl.searchParams.delete("schema");
const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect();
const exists = await admin.query("select 1 from pg_database where datname = $1", [databaseName]);
if (exists.rowCount === 0) await admin.query(`create database "${databaseName}"`);
await admin.end();
const schema = getDatabaseSchema();
const client = await getPool().connect();
try {
  await client.query(`create schema if not exists "${schema}"`);
  await client.query(`set search_path to "${schema}", public`);
  await client.query("select pg_advisory_lock(hashtext('sjz-schema-migrations'))");
  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql") && !name.startsWith("._")).sort();
  const existingSchema = await client.query<{ exists: boolean }>(
    "select to_regclass(format('%I.creators', $1::text)) is not null exists", [schema],
  );
  await client.query(
    `create table if not exists "${schema}".schema_migrations (
       filename text primary key,
       applied_at timestamptz not null default now()
     )`,
  );
  const applied = await client.query<{ filename: string }>(`select filename from "${schema}".schema_migrations`);
  const appliedFiles = new Set(applied.rows.map((row) => row.filename));
  const loginRateLimits = await client.query<{ exists: boolean }>(
    "select to_regclass(format('%I.login_rate_limits', $1::text)) is not null exists", [schema],
  );
  if (!loginRateLimits.rows[0]?.exists) appliedFiles.delete("013_login_rate_limits.sql");

  // Releases before the ledger repeatedly ran migrations 001-013. Register
  // only that known legacy set, leaving newer files to execute normally.
  if (existingSchema.rows[0]?.exists && appliedFiles.size === 0) {
    const legacyFiles = files.filter((file) => file <= "013_login_rate_limits.sql"
      && (file !== "013_login_rate_limits.sql" || loginRateLimits.rows[0]?.exists));
    if (legacyFiles.length) {
      await client.query(
        `insert into "${schema}".schema_migrations(filename) select unnest($1::text[]) on conflict do nothing`,
        [legacyFiles],
      );
      for (const file of legacyFiles) appliedFiles.add(file);
      console.log(`登记历史迁移 ${legacyFiles.length} 个`);
    }
  }

  for (const file of files) {
    if (appliedFiles.has(file)) continue;
    console.log(`应用数据库迁移 ${file}`);
    await client.query("begin");
    try {
      await client.query(await readFile(resolve(migrationsDir, file), "utf8"));
      await client.query(
        `insert into "${schema}".schema_migrations(filename) values($1)
         on conflict(filename) do update set applied_at=now()`, [file],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
} finally {
  await client.query("select pg_advisory_unlock(hashtext('sjz-schema-migrations'))").catch(() => undefined);
  client.release();
}
await getPool().end();
console.log("数据库迁移完成");
