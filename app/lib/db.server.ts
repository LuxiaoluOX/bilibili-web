import pg from "pg";
import { env } from "./env.server";

const { Pool } = pg;

let pool: pg.Pool | undefined;

function connectionConfig() {
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL 未配置");
  const url = new URL(env.DATABASE_URL);
  const schema = url.searchParams.get("schema") ?? "public";
  if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(schema)) throw new Error("DATABASE_URL 中的 schema 无效");
  url.searchParams.delete("schema");
  return { connectionString: url.toString(), schema };
}

export function isDatabaseConfigured() {
  return Boolean(env.DATABASE_URL);
}

export function getPool() {
  const config = connectionConfig();
  pool ??= new Pool({
    connectionString: config.connectionString,
    options: `--search_path=${config.schema},public`,
    max: 10,
    idleTimeoutMillis: 30_000,
  });
  return pool;
}

export function getDatabaseSchema() {
  return connectionConfig().schema;
}

export async function query<T extends pg.QueryResultRow>(text: string, values: unknown[] = []) {
  return getPool().query<T>(text, values);
}

export async function transaction<T>(callback: (client: pg.PoolClient) => Promise<T>) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function databaseHealthy() {
  if (!isDatabaseConfigured()) return false;
  try {
    await query("select 1");
    return true;
  } catch {
    return false;
  }
}
