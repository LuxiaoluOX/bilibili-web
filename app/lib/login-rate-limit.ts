import { createHash } from "node:crypto";

export type LoginRateLimitState = {
  attempts: number;
  windowStartedAt: number;
  blockedUntil: number | null;
};

export type LoginRateLimitConfig = {
  maxAttempts: number;
  windowMs: number;
  blockMs: number;
};

function hashKey(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function loginRateLimitKeys(username: string, clientAddress: string | null) {
  return {
    account: hashKey(`account:${username.trim().toLowerCase()}`),
    network: clientAddress ? hashKey(`network:${clientAddress}`) : null,
  };
}

export function getLoginClientAddress(request: Request) {
  // Only Caddy writes this internal header. Public forwarding headers are
  // intentionally ignored because clients can forge them.
  const value = request.headers.get("x-sjz-client-ip")?.trim();
  return value ? value.slice(0, 128) : null;
}

export function nextLoginRateLimitState(
  current: LoginRateLimitState | null,
  config: LoginRateLimitConfig,
  now = Date.now(),
) {
  if (current?.blockedUntil && current.blockedUntil > now) {
    return {
      state: current,
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.blockedUntil - now) / 1000)),
    };
  }
  const windowExpired = !current || now - current.windowStartedAt >= config.windowMs;
  const attempts = windowExpired ? 1 : current.attempts + 1;
  const blockedUntil = attempts > config.maxAttempts ? now + config.blockMs : null;
  return {
    state: { attempts, windowStartedAt: windowExpired ? now : current.windowStartedAt, blockedUntil },
    allowed: blockedUntil === null,
    retryAfterSeconds: blockedUntil === null ? 0 : Math.ceil(config.blockMs / 1000),
  };
}
