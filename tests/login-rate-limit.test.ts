import { describe, expect, it } from "vitest";
import {
  getLoginClientAddress,
  loginRateLimitKeys,
  nextLoginRateLimitState,
} from "../app/lib/login-rate-limit";

const config = { maxAttempts: 2, windowMs: 60_000, blockMs: 120_000 };

describe("登录限流", () => {
  it("在窗口内超过阈值后阻止验证", () => {
    const first = nextLoginRateLimitState(null, config, 1_000);
    const second = nextLoginRateLimitState(first.state, config, 2_000);
    const third = nextLoginRateLimitState(second.state, config, 3_000);
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBe(120);
  });

  it("窗口结束后重新计数", () => {
    const current = { attempts: 2, windowStartedAt: 1_000, blockedUntil: null };
    const next = nextLoginRateLimitState(current, config, 61_000);
    expect(next.allowed).toBe(true);
    expect(next.state.attempts).toBe(1);
  });

  it("只使用受反向代理清洗的内部客户端地址", () => {
    const request = new Request("http://local/login", { headers: {
      "x-sjz-client-ip": "203.0.113.7",
      "cf-connecting-ip": "198.51.100.10",
      "x-forwarded-for": "198.51.100.11",
    } });
    expect(getLoginClientAddress(request)).toBe("203.0.113.7");
  });

  it("没有可信地址头时不创建全局共享的网络键", () => {
    const request = new Request("http://local/login", { headers: { "x-forwarded-for": "203.0.113.7" } });
    expect(getLoginClientAddress(request)).toBeNull();
    expect(loginRateLimitKeys("admin", null).network).toBeNull();
  });

  it("账户键忽略用户名大小写且不保存原值", () => {
    const first = loginRateLimitKeys("Admin", "203.0.113.7");
    const second = loginRateLimitKeys("admin", "203.0.113.7");
    expect(first.account).toBe(second.account);
    expect(first.account).not.toContain("admin");
  });
});
