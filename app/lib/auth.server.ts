import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import { redirect } from "react-router";
import { query } from "./db.server";
import type { Role } from "./domain";
import { demoMode } from "./env.server";

const COOKIE_NAME = "sjz_session";
const SESSION_DAYS = 14;

export type AuthUser = { id: string; username: string; email: string | null; displayName: string; role: Role };

function cookieValue(request: Request) {
  const cookies = request.headers.get("cookie") ?? "";
  return cookies.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function getCurrentUser(request: Request): Promise<AuthUser | null> {
  if (demoMode) {
    const demoAdmin = await query<{
      id: string; username: string; email: string | null; display_name: string; role: Role;
    }>(
      `select id, username, email, display_name, role from users
       where role = 'admin' and is_active = true and deleted_at is null
       order by created_at
       limit 1`,
    );
    const row = demoAdmin.rows[0];
    if (!row) throw new Error("演示模式缺少本地管理员，请先运行 npm run db:admin");
    return { id: row.id, username: row.username, email: row.email, displayName: row.display_name, role: row.role };
  }
  const token = cookieValue(request);
  if (!token) return null;
  const result = await query<{
    id: string; username: string; email: string | null; display_name: string; role: Role;
  }>(
    `select u.id, u.username, u.email, u.display_name, u.role
     from sessions s join users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now() and u.is_active = true and u.deleted_at is null`,
    [tokenHash(token)],
  );
  const row = result.rows[0];
  return row ? { id: row.id, username: row.username, email: row.email, displayName: row.display_name, role: row.role } : null;
}

export async function requireUser(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    const url = new URL(request.url);
    throw redirect(`/login?returnTo=${encodeURIComponent(url.pathname + url.search)}`);
  }
  return user;
}

export async function requireRole(request: Request, allowed: Role[]) {
  const user = await requireUser(request);
  if (!allowed.includes(user.role)) throw new Response("无权执行此操作", { status: 403 });
  return user;
}

export async function login(username: string, password: string) {
  const result = await query<{
    id: string; username: string; email: string | null; display_name: string; role: Role; password_hash: string;
  }>("select id, username, email, display_name, role, password_hash from users where lower(username) = lower($1) and is_active = true and deleted_at is null", [username]);
  const user = result.rows[0];
  if (!user || !(await argon2.verify(user.password_hash, password))) return null;

  const token = randomBytes(32).toString("base64url");
  await query(
    "insert into sessions (user_id, token_hash, expires_at) values ($1, $2, now() + interval '14 days')",
    [user.id, tokenHash(token)],
  );
  return {
    user: { id: user.id, username: user.username, email: user.email, displayName: user.display_name, role: user.role },
    cookie: `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
  };
}

export async function logout(request: Request) {
  const token = cookieValue(request);
  if (token) await query("delete from sessions where token_hash = $1", [tokenHash(token)]);
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
