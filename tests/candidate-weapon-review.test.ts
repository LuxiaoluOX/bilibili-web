import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../app/lib/db.server", () => ({
  query,
  getPool: vi.fn(),
  transaction: (callback: (client: { query: typeof query }) => unknown) => callback({ query }),
}));

import { acceptCandidate } from "../app/lib/crawler.server";

describe("reviewed weapon identity", () => {
  beforeEach(() => {
    query.mockReset();
    query.mockImplementation(async (sql: string, values: unknown[] = []) => {
      if (sql.includes("select ec.*")) return { rows: [{
        id: "candidate", source_content_id: "source", creator_id: "creator",
        raw_code: "CODE", normalized_code: "CODE", weapon_id: "old-weapon",
        weapon_name: "K437", build_name: "方案", confidence: "0.9",
        source_type: "video_description", game_mode: "operations", status: "pending",
      }] };
      if (sql.includes("select w.id from weapons")) return { rows: values[0] === "M7" ? [{ id: "new-weapon" }] : [] };
      if (sql.includes("insert into weapon_builds")) return { rows: [{ id: "build", current_version: 1 }] };
      if (sql.includes("select id, version from weapon_build_versions")) return { rows: [{ id: "version", version: 1 }] };
      if (sql.includes("select published_at")) return { rows: [{ published_at: null }] };
      if (sql.includes("select version, source_published_at")) return { rows: [{ version: 1, source_published_at: null }] };
      return { rows: [], rowCount: 1 };
    });
  });

  it("replaces the old catalog ID when the reviewer corrects the weapon", async () => {
    await acceptCandidate("candidate", "reviewer", { weaponName: "M7" });
    const update = query.mock.calls.find(([sql]) => sql.includes("update extraction_candidates"));
    expect(update?.[0]).toContain("weapon_id = $8");
    expect(update?.[1][7]).toBe("new-weapon");
  });

  it("clears the old catalog ID when the corrected weapon has no catalog match", async () => {
    await acceptCandidate("candidate", "reviewer", { weaponName: "未知型号" });
    const update = query.mock.calls.find(([sql]) => sql.includes("update extraction_candidates"));
    expect(update?.[1][7]).toBeNull();
  });
});
