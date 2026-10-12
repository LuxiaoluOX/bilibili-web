import argon2 from "argon2";
import { getPool } from "../app/lib/db.server";

const username = process.env.ADMIN_USERNAME ?? "admin";
const email = process.env.ADMIN_EMAIL || null;
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME ?? "系统管理员";

if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/.test(username) || !password || password.length < 8) {
  throw new Error("请设置合法的 ADMIN_USERNAME 和至少 8 位的 ADMIN_PASSWORD");
}

const hash = await argon2.hash(password, { type: argon2.argon2id });
await getPool().query(
  `insert into users (username, email, display_name, password_hash, role)
   values ($1, $2, $3, $4, 'admin')
   on conflict (lower(username)) do update set email = excluded.email, display_name = excluded.display_name,
     password_hash = excluded.password_hash, role = 'admin', is_active = true, deleted_at = null, updated_at = now()`,
  [username.toLowerCase(), email?.toLowerCase() ?? null, name, hash],
);
await getPool().end();
console.log(`管理员 ${username} 已就绪`);
