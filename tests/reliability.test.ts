import { describe, expect, it } from "vitest";
import { isRunStale, retryDelaySeconds, workerState } from "../app/lib/reliability";

const now = new Date("2026-10-12T02:00:00.000Z");

describe("crawl reliability policy", () => {
  it("classifies worker heartbeat freshness without hiding missing heartbeats", () => {
    expect(workerState(null, now)).toBe("never_seen");
    expect(workerState(new Date(now.getTime() - 29_000), now)).toBe("online");
    expect(workerState(new Date(now.getTime() - 31_000), now)).toBe("offline");
  });

  it("only marks running jobs stale after fifteen minutes without activity", () => {
    expect(isRunStale("queued", new Date(now.getTime() - 60 * 60_000), null, now)).toBe(false);
    expect(isRunStale("running", new Date(now.getTime() - 14 * 60_000), null, now)).toBe(false);
    expect(isRunStale("running", new Date(now.getTime() - 16 * 60_000), null, now)).toBe(true);
  });

  it("keeps ordinary retries bounded and risk-control cooling between six and twelve hours", () => {
    expect(retryDelaySeconds(1, false)).toBe(30);
    expect(retryDelaySeconds(2, false)).toBe(60);
    expect(retryDelaySeconds(20, false)).toBe(1800);
    expect(retryDelaySeconds(1, true, 0)).toBe(6 * 60 * 60);
    expect(retryDelaySeconds(1, true, 1)).toBe(12 * 60 * 60);
  });
});
