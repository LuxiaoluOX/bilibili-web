import { decryptSecret, encryptSecret } from "./crypto.server";
import { query } from "./db.server";
import { audit } from "./audit.server";

export async function getBilibiliCookie() {
  const result = await query<{ encrypted_cookie: string }>("select encrypted_cookie from bilibili_credentials order by updated_at desc limit 1");
  return result.rows[0] ? decryptSecret(result.rows[0].encrypted_cookie) : null;
}

export async function credentialStatus() {
  const result = await query<{ status: string; updated_at: Date; last_checked_at: Date | null; login_method: string; account_name: string | null; account_mid: string | null }>(
    "select status, updated_at, last_checked_at, login_method, account_name, account_mid::text from bilibili_credentials order by updated_at desc limit 1",
  );
  const row = result.rows[0];
  return row ? {
    configured: true,
    status: row.status,
    updatedAt: row.updated_at.toISOString(),
    lastCheckedAt: row.last_checked_at?.toISOString() ?? null,
    loginMethod: row.login_method,
    accountName: row.account_name,
    accountMid: row.account_mid,
  } : { configured: false, status: "missing", updatedAt: null, lastCheckedAt: null, loginMethod: null, accountName: null, accountMid: null };
}

export async function saveBilibiliSession(
  cookie: string,
  userId: string,
  method: "manual" | "qr" | "password",
  account?: { mid: string; name: string },
) {
  await query(
    `insert into bilibili_credentials
     (encrypted_cookie, status, last_checked_at, updated_by, login_method, account_name, account_mid)
     values ($1, 'valid', now(), $2, $3, $4, $5)`,
    [encryptSecret(cookie.trim()), userId, method, account?.name ?? null, account?.mid ?? null],
  );
  await audit(userId, "credential.updated", "bilibili_credential", undefined, { method, accountMid: account?.mid ?? null });
}

export async function saveBilibiliCookie(cookie: string, userId: string) {
  await saveBilibiliSession(cookie, userId, "manual");
}
