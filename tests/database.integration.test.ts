import { afterAll, describe, expect, it } from "vitest";
import { getPool, getDatabaseSchema } from "../app/lib/db.server";
import { isDatabaseConfigured } from "../app/lib/db.server";
import { acceptCandidate, importManualText, persistSource, reparseStoredSources } from "../app/lib/crawler.server";
import { assignUnknownBuildsToMode } from "../app/lib/game-mode-governance.server";
import { CreatorUnavailableError, enqueueCrawl } from "../app/lib/queue.server";
import { CandidateReviewConflictError, rejectPendingCandidates } from "../app/lib/review.server";
import { consumeLoginAttempt } from "../app/lib/login-rate-limit.server";
import { loginRateLimitKeys } from "../app/lib/login-rate-limit";
import { publishSeasonCandidate } from "../app/lib/season-sync.server";
import { importWeaponDirectory } from "../app/lib/weapon-catalog.server";

describe.runIf(isDatabaseConfigured())("PostgreSQL 集成", () => {
  afterAll(async () => { await getPool().end(); });

  it("迁移已创建核心表并使用目标 schema", async () => {
    const result = await getPool().query<{ name: string }>(
      `select table_name name from information_schema.tables where table_schema = $1`,
      [getDatabaseSchema()],
    );
    const names = result.rows.map((row) => row.name);
    expect(names).toEqual(expect.arrayContaining(["schema_migrations", "creators", "crawl_runs", "extraction_candidates", "weapon_build_versions", "audit_logs", "login_rate_limits"]));
  });

  it("数据库拒绝非法用户角色", async () => {
    await expect(getPool().query(
      "insert into users (username, email, display_name, password_hash, role) values ('invalid_role', 'invalid-role@test.local', 'Invalid', 'x', 'owner')",
    )).rejects.toMatchObject({ code: "23514" });
  });

  it("用户表支持用户名登录与软删除", async () => {
    const result = await getPool().query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_schema = $1 and table_name = 'users'`,
      [getDatabaseSchema()],
    );
    expect(result.rows.map((row) => row.column_name)).toEqual(expect.arrayContaining(["username", "deleted_at"]));
  });

  it("B 站凭据记录包含受约束的登录方式", async () => {
    const result = await getPool().query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_schema = $1 and table_name = 'bilibili_credentials'`,
      [getDatabaseSchema()],
    );
    expect(result.rows.map((row) => row.column_name)).toEqual(expect.arrayContaining(["login_method", "account_name", "account_mid"]));
  });

  it("拒绝为停用创作者创建抓取任务", async () => {
    const creator = await getPool().query<{ id: string }>(
      `insert into creators (bilibili_mid, name, enabled)
       values ($1, 'queue-guard-test', false) returning id`,
      [Date.now()],
    );
    const creatorId = creator.rows[0].id;
    try {
      await expect(enqueueCrawl(creatorId, "manual")).rejects.toBeInstanceOf(CreatorUnavailableError);
      const runs = await getPool().query<{ count: string }>("select count(*)::text count from crawl_runs where creator_id = $1", [creatorId]);
      expect(Number(runs.rows[0].count)).toBe(0);
    } finally {
      await getPool().query("delete from creators where id = $1", [creatorId]);
    }
  });

  it("已接受候选不能被过期审核改为拒绝", async () => {
    const reviewer = await getPool().query<{ id: string }>(
      "select id from users where role = 'admin' and is_active = true and deleted_at is null limit 1",
    );
    expect(reviewer.rows[0]).toBeTruthy();
    const suffix = Date.now();
    const creator = await getPool().query<{ id: string }>(
      "insert into creators (bilibili_mid, name) values ($1, 'review-guard-test') returning id",
      [suffix],
    );
    const creatorId = creator.rows[0].id;
    const video = await getPool().query<{ id: string }>(
      `insert into videos (creator_id, bvid, title, source_url)
       values ($1, $2, 'review-guard-test', 'https://www.bilibili.com/video/test') returning id`,
      [creatorId, `BVTEST${suffix}`],
    );
    const source = await getPool().query<{ id: string }>(
      `insert into source_contents (video_id, source_type, external_id, raw_text, content_hash, source_url, game_mode)
       values ($1, 'video_description', $2, 'test', $3, 'https://www.bilibili.com/video/test', 'operations') returning id`,
      [video.rows[0].id, `description:test:${suffix}`, `hash-${suffix}`],
    );
    const candidate = await getPool().query<{ id: string }>(
      `insert into extraction_candidates
       (source_content_id, creator_id, raw_code, normalized_code, weapon_name, normalized_weapon,
        build_name, normalized_build_name, confidence, code_confidence, weapon_confidence, attribution_status, status, game_mode)
       values ($1, $2, 'TEST-CODE', $3, 'K437', 'K437', '测试方案', '测试方案', 0.9, 0.9, 0.99, 'resolved', 'pending', 'operations')
       returning id`,
      [source.rows[0].id, creatorId, `TESTCODE${suffix}`],
    );
    try {
      await acceptCandidate(candidate.rows[0].id, reviewer.rows[0].id);
      await expect(rejectPendingCandidates([candidate.rows[0].id], reviewer.rows[0].id)).rejects.toBeInstanceOf(CandidateReviewConflictError);
      const status = await getPool().query<{ status: string }>("select status from extraction_candidates where id = $1", [candidate.rows[0].id]);
      expect(status.rows[0].status).toBe("accepted");
    } finally {
      await getPool().query(
        `delete from version_sources where version_id in (
           select wbv.id from weapon_build_versions wbv join weapon_builds wb on wb.id = wbv.build_id where wb.creator_id = $1
         )`,
        [creatorId],
      );
      await getPool().query("delete from weapon_build_versions where build_id in (select id from weapon_builds where creator_id = $1)", [creatorId]);
      await getPool().query("delete from weapon_builds where creator_id = $1", [creatorId]);
      await getPool().query("delete from extraction_candidates where creator_id = $1", [creatorId]);
      await getPool().query("delete from source_contents where video_id = $1", [video.rows[0].id]);
      await getPool().query("delete from videos where id = $1", [video.rows[0].id]);
      await getPool().query("delete from creators where id = $1", [creatorId]);
    }
  });

  it("登录限流会清理过期记录", async () => {
    const suffix = Date.now();
    const staleKey = `stale-${suffix}`;
    const username = `cleanup-${suffix}`;
    const clientAddress = "203.0.113.45";
    const keys = loginRateLimitKeys(username, clientAddress);
    await getPool().query(
      `insert into login_rate_limits (key_hash, attempts, window_started_at, updated_at)
       values ($1, 1, now() - interval '25 hours', now() - interval '25 hours')`,
      [staleKey],
    );
    try {
      await consumeLoginAttempt(username, new Request("http://local/login", { headers: { "x-sjz-client-ip": clientAddress } }));
      const stale = await getPool().query("select 1 from login_rate_limits where key_hash = $1", [staleKey]);
      expect(stale.rowCount).toBe(0);
    } finally {
      await getPool().query("delete from login_rate_limits where key_hash = any($1::text[])", [[staleKey, keys.account, keys.network]]);
    }
  });

  it("允许发布没有新增武器的新赛季", async () => {
    const reviewer = await getPool().query<{ id: string }>(
      "select id from users where role = 'admin' and is_active = true and deleted_at is null limit 1",
    );
    expect(reviewer.rows[0]).toBeTruthy();
    const suffix = Date.now();
    const seasonCode = "S999";
    const source = await getPool().query<{ id: string }>(
      `insert into season_sync_sources(provider, external_id, title, source_url, content_hash, raw_content)
       values('test', $1, 'season-only-test', 'https://example.test/season', $2, 'test') returning id`,
      [`season-only-${suffix}`, `hash-${suffix}`],
    );
    const candidate = await getPool().query<{ id: string }>(
      `insert into season_sync_candidates(source_id, season_code, season_name, starts_at, detected_weapons)
       values($1, $2, '测试赛季', '2099-01-01T00:00:00Z', '[]'::jsonb) returning id`,
      [source.rows[0].id, seasonCode],
    );
    try {
      const result = await publishSeasonCandidate(candidate.rows[0].id, reviewer.rows[0].id);
      expect(result).toMatchObject({ seasonCode, weapons: [] });
      const season = await getPool().query("select 1 from game_seasons where code = $1", [seasonCode]);
      expect(season.rowCount).toBe(1);
    } finally {
      await getPool().query("delete from audit_logs where entity_type = 'season_sync_candidate' and entity_id = $1", [candidate.rows[0].id]);
      await getPool().query("delete from season_sync_runs where kind = 'publish' and summary->>'seasonCode' = $1", [seasonCode]);
      await getPool().query("delete from game_seasons where code = $1", [seasonCode]);
      await getPool().query("delete from season_sync_sources where id = $1", [source.rows[0].id]);
    }
  });

  it("人工模式归类会合并目标方案并在重解析后保留", async () => {
    const suffix = Date.now();
    const externalId = `description:mode-governance:${suffix}`;
    const raw = "K437 性价比中高改32万 - 6KURTQC07FI7MVPVB9B3H";
    const creator = await getPool().query<{ id: string }>(
      "insert into creators (bilibili_mid, name) values ($1, 'mode-governance-test') returning id",
      [suffix],
    );
    const creatorId = creator.rows[0].id;
    const video = await getPool().query<{ id: string }>(
      `insert into videos (creator_id, bvid, title, description, source_url)
       values ($1, $2, 'mode-governance-test', $3, 'https://www.bilibili.com/video/test') returning id`,
      [creatorId, `BVMODE${suffix}`, raw],
    );

    try {
      await persistSource(
        video.rows[0].id,
        creatorId,
        "video_description",
        externalId,
        raw,
        "https://www.bilibili.com/video/test",
        null,
        new Date("2026-01-01T00:00:00Z"),
        "manual",
        "unknown",
      );
      const unknown = await getPool().query<{
        id: string; weapon_name: string; normalized_weapon: string; build_name: string; normalized_build_name: string;
      }>("select id, weapon_name, normalized_weapon, build_name, normalized_build_name from weapon_builds where creator_id = $1 and game_mode = 'unknown'", [creatorId]);
      expect(unknown.rows[0]).toBeTruthy();

      const target = await getPool().query<{ id: string }>(
        `insert into weapon_builds
         (creator_id, game_mode, weapon_name, normalized_weapon, build_name, normalized_build_name, current_version)
         values ($1, 'black_tide', $2, $3, $4, $5, 1) returning id`,
        [creatorId, unknown.rows[0].weapon_name, unknown.rows[0].normalized_weapon, unknown.rows[0].build_name, unknown.rows[0].normalized_build_name],
      );
      await getPool().query(
        `insert into weapon_build_versions (build_id, game_mode, version, code)
         values ($1, 'black_tide', 1, '6KURTQC07FI7MVPVB9B3H')`,
        [target.rows[0].id],
      );
      await getPool().query(
        `insert into weapon_build_versions (build_id, game_mode, version, code)
         values ($1, 'unknown', 2, '6KURTQC07FI7MVPVB9B3X')`,
        [unknown.rows[0].id],
      );

      await expect(assignUnknownBuildsToMode([unknown.rows[0].id], "black_tide")).resolves.toBe(1);
      const merged = await getPool().query<{ game_mode: string; codes: string[] }>(
        `select wb.game_mode, array_agg(wbv.code order by wbv.version) codes
         from weapon_builds wb join weapon_build_versions wbv on wbv.build_id = wb.id
         where wb.id = $1 group by wb.id`,
        [target.rows[0].id],
      );
      expect(merged.rows[0]).toMatchObject({ game_mode: "black_tide" });
      expect(merged.rows[0].codes).toEqual(expect.arrayContaining(["6KURTQC07FI7MVPVB9B3H", "6KURTQC07FI7MVPVB9B3X"]));

      const manualState = await getPool().query<{ game_mode: string; game_mode_override: boolean }>(
        "select game_mode, game_mode_override from extraction_candidates where creator_id = $1",
        [creatorId],
      );
      expect(manualState.rows[0]).toEqual({ game_mode: "black_tide", game_mode_override: true });

      await reparseStoredSources({ externalIds: [externalId] });
      const afterReparse = await getPool().query<{ unknown_builds: string; mode: string; overridden: boolean }>(
        `select
           (select count(*)::text from weapon_builds where creator_id = $1 and game_mode = 'unknown') unknown_builds,
           sc.game_mode mode,
           sc.game_mode_override overridden
         from source_contents sc where sc.external_id = $2`,
        [creatorId, externalId],
      );
      expect(afterReparse.rows[0]).toEqual({ unknown_builds: "0", mode: "black_tide", overridden: true });
    } finally {
      await getPool().query(
        "delete from version_sources where version_id in (select wbv.id from weapon_build_versions wbv join weapon_builds wb on wb.id = wbv.build_id where wb.creator_id = $1)",
        [creatorId],
      );
      await getPool().query("delete from weapon_build_versions where build_id in (select id from weapon_builds where creator_id = $1)", [creatorId]);
      await getPool().query("delete from weapon_builds where creator_id = $1", [creatorId]);
      await getPool().query("delete from extraction_candidates where creator_id = $1", [creatorId]);
      await getPool().query("delete from source_contents where video_id = $1", [video.rows[0].id]);
      await getPool().query("delete from videos where id = $1", [video.rows[0].id]);
      await getPool().query("delete from creators where id = $1", [creatorId]);
    }
  });

  it("手动导入复用已有视频的发布时间", async () => {
    const suffix = Date.now();
    const bvid = `BV${String(suffix).slice(-10).padStart(10, "0")}`;
    const publishedAt = new Date("2024-01-02T03:04:05Z");
    const creator = await getPool().query<{ id: string }>(
      "insert into creators (bilibili_mid, name) values ($1, 'manual-time-test') returning id",
      [suffix],
    );
    const creatorId = creator.rows[0].id;
    const video = await getPool().query<{ id: string }>(
      `insert into videos (creator_id, bvid, title, published_at, source_url)
       values ($1, $2, 'manual-time-test', $3, $4) returning id`,
      [creatorId, bvid, publishedAt, `https://www.bilibili.com/video/${bvid}`],
    );
    try {
      const imported = await importManualText({
        creatorId,
        rawText: "仅用于验证发布时间",
        sourceUrl: `https://www.bilibili.com/video/${bvid}`,
      });
      const source = await getPool().query<{ published_at: Date | null }>(
        "select published_at from source_contents where external_id = $1",
        [imported.sourceId],
      );
      expect(source.rows[0].published_at?.toISOString()).toBe(publishedAt.toISOString());
    } finally {
      await getPool().query("delete from source_contents where video_id = $1", [video.rows[0].id]);
      await getPool().query("delete from videos where id = $1", [video.rows[0].id]);
      await getPool().query("delete from creators where id = $1", [creatorId]);
    }
  });

  it("空简介会移除旧投影并按剩余来源重算发布时间", async () => {
    const suffix = Date.now();
    const raw = "K437 性价比中高改32万 - 6KURTQC07FI7MVPVB9B3H";
    const oldPublishedAt = new Date("2024-01-01T00:00:00Z");
    const newPublishedAt = new Date("2025-01-01T00:00:00Z");
    const creator = await getPool().query<{ id: string }>(
      "insert into creators (bilibili_mid, name) values ($1, 'empty-source-test') returning id",
      [suffix],
    );
    const creatorId = creator.rows[0].id;
    const videos = await getPool().query<{ id: string; bvid: string }>(
      `insert into videos (creator_id, bvid, title, description, published_at, source_url)
       values
         ($1, $2, 'old-source', $4, $5, 'https://www.bilibili.com/video/old'),
         ($1, $3, 'new-source', $4, $6, 'https://www.bilibili.com/video/new')
       returning id, bvid`,
      [creatorId, `BVOLD${suffix}`, `BVNEW${suffix}`, raw, oldPublishedAt, newPublishedAt],
    );
    const oldVideo = videos.rows.find((video) => video.bvid === `BVOLD${suffix}`)!;
    const newVideo = videos.rows.find((video) => video.bvid === `BVNEW${suffix}`)!;
    const oldExternalId = `description:old:${suffix}`;
    const newExternalId = `description:new:${suffix}`;
    try {
      await persistSource(oldVideo.id, creatorId, "video_description", oldExternalId, raw, "https://www.bilibili.com/video/old", null, oldPublishedAt, "api", "operations");
      await persistSource(newVideo.id, creatorId, "video_description", newExternalId, raw, "https://www.bilibili.com/video/new", null, newPublishedAt, "api", "operations");
      const before = await getPool().query<{ source_published_at: Date; sources: string }>(
        `select wbv.source_published_at, count(vs.source_content_id)::text sources
         from weapon_build_versions wbv
         join weapon_builds wb on wb.id = wbv.build_id
         join version_sources vs on vs.version_id = wbv.id
         where wb.creator_id = $1
         group by wbv.id`,
        [creatorId],
      );
      expect(before.rows[0].source_published_at.toISOString()).toBe(newPublishedAt.toISOString());
      expect(before.rows[0].sources).toBe("2");

      await persistSource(newVideo.id, creatorId, "video_description", newExternalId, "", "https://www.bilibili.com/video/new", null, newPublishedAt, "api", "operations");
      const after = await getPool().query<{ source_published_at: Date; sources: string }>(
        `select wbv.source_published_at, count(vs.source_content_id)::text sources
         from weapon_build_versions wbv
         join weapon_builds wb on wb.id = wbv.build_id
         join version_sources vs on vs.version_id = wbv.id
         where wb.creator_id = $1
         group by wbv.id`,
        [creatorId],
      );
      expect(after.rows[0].source_published_at.toISOString()).toBe(oldPublishedAt.toISOString());
      expect(after.rows[0].sources).toBe("1");
      const cleared = await getPool().query<{ raw_text: string; status: string }>(
        `select sc.raw_text, ec.status
         from source_contents sc join extraction_candidates ec on ec.source_content_id = sc.id
         where sc.external_id = $1`,
        [newExternalId],
      );
      expect(cleared.rows[0]).toEqual({ raw_text: "", status: "ignored" });
    } finally {
      await getPool().query(
        "delete from version_sources where version_id in (select wbv.id from weapon_build_versions wbv join weapon_builds wb on wb.id = wbv.build_id where wb.creator_id = $1)",
        [creatorId],
      );
      await getPool().query("delete from weapon_build_versions where build_id in (select id from weapon_builds where creator_id = $1)", [creatorId]);
      await getPool().query("delete from weapon_builds where creator_id = $1", [creatorId]);
      await getPool().query("delete from extraction_candidates where creator_id = $1", [creatorId]);
      await getPool().query("delete from source_contents where video_id = any($1::uuid[])", [videos.rows.map((video) => video.id)]);
      await getPool().query("delete from videos where creator_id = $1", [creatorId]);
      await getPool().query("delete from creators where id = $1", [creatorId]);
    }
  });

  it("武器目录导入拒绝占用其他武器的别名", async () => {
    const reviewer = await getPool().query<{ id: string }>(
      "select id from users where role = 'admin' and is_active = true and deleted_at is null limit 1",
    );
    expect(reviewer.rows[0]).toBeTruthy();
    const suffix = Date.now();
    const existingName = `ALIAS-OWNER-${suffix}`;
    const conflictingAlias = `SHARED-ALIAS-${suffix}`;
    const importedName = `ALIAS-IMPORT-${suffix}`;
    const weapon = await getPool().query<{ id: string }>(
      `insert into weapons (canonical_name, normalized_name, created_by)
       values ($1, $1, $2) returning id`,
      [existingName, reviewer.rows[0].id],
    );
    await getPool().query(
      `insert into weapon_aliases (weapon_id, alias, normalized_alias)
       values ($1, $2, $2)`,
      [weapon.rows[0].id, conflictingAlias],
    );
    try {
      await expect(importWeaponDirectory(`${importedName}|||${conflictingAlias}`, reviewer.rows[0].id)).rejects.toThrow("已属于");
      const imported = await getPool().query("select 1 from weapons where normalized_name = $1", [importedName]);
      expect(imported.rowCount).toBe(0);
      const owner = await getPool().query<{ weapon_id: string }>(
        "select weapon_id from weapon_aliases where normalized_alias = $1",
        [conflictingAlias],
      );
      expect(owner.rows[0].weapon_id).toBe(weapon.rows[0].id);
    } finally {
      await getPool().query("delete from weapons where id = $1", [weapon.rows[0].id]);
    }
  });
});
