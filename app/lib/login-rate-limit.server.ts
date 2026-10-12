import { query, transaction } from "./db.server";
import {
  getLoginClientAddress,
  loginRateLimitKeys,
  nextLoginRateLimitState,
  type LoginRateLimitConfig,
} from "./login-rate-limit";

const ACCOUNT_LIMIT: LoginRateLimitConfig = { maxAttempts: 5, windowMs: 15 * 60_000, blockMs: 15 * 60_000 };
const NETWORK_LIMIT: LoginRateLimitConfig = { maxAttempts: 20, windowMs: 15 * 60_000, blockMs: 15 * 60_000 };

type RateLimitRow = {
  attempts: number;
  window_started_at: Date;
  blocked_until: Date | null;
};

export async function consumeLoginAttempt(username: string, request: Request) {
  const keys = loginRateLimitKeys(username, getLoginClientAddress(request));
  const entries = [
    ...(keys.network ? [{ key: keys.network, config: NETWORK_LIMIT }] : []),
    { key: keys.account, config: ACCOUNT_LIMIT },
  ];

  return transaction(async (client) => {
    const now = Date.now();
    let allowed = true;
    let retryAfterSeconds = 0;
    await client.query("delete from login_rate_limits where updated_at < now() - interval '24 hours'");
    for (const entry of entries) {
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [`login-rate:${entry.key}`]);
      const stored = await client.query<RateLimitRow>(
        "select attempts, window_started_at, blocked_until from login_rate_limits where key_hash = $1 for update",
        [entry.key],
      );
      const row = stored.rows[0];
      const next = nextLoginRateLimitState(row ? {
        attempts: row.attempts,
        windowStartedAt: row.window_started_at.getTime(),
        blockedUntil: row.blocked_until?.getTime() ?? null,
      } : null, entry.config, now);
      await client.query(
        `insert into login_rate_limits (key_hash, attempts, window_started_at, blocked_until, updated_at)
         values ($1, $2, $3, $4, now())
         on conflict (key_hash) do update set attempts = excluded.attempts,
           window_started_at = excluded.window_started_at, blocked_until = excluded.blocked_until, updated_at = now()`,
        [entry.key, next.state.attempts, new Date(next.state.windowStartedAt), next.state.blockedUntil ? new Date(next.state.blockedUntil) : null],
      );
      allowed = allowed && next.allowed;
      retryAfterSeconds = Math.max(retryAfterSeconds, next.retryAfterSeconds);
      if (!next.allowed) break;
    }
    return { allowed, retryAfterSeconds };
  });
}

export async function clearAccountLoginLimit(username: string) {
  const key = loginRateLimitKeys(username, null).account;
  await query("delete from login_rate_limits where key_hash = $1", [key]);
}
