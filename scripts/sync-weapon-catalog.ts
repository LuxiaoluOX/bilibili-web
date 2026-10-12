import type pg from "pg";
import { getPool } from "../app/lib/db.server";
import { INVALID_LEGACY_WEAPON_NAMES, OFFICIAL_WEAPON_CATALOG } from "../app/lib/weapon-catalog-data";
import { normalizeLabel } from "../app/lib/parser";

type WeaponRow = { id: string; canonical_name: string; normalized_name: string };

const dryRun = process.argv.includes("--dry-run");

async function findWeapons(client: pg.PoolClient, names: string[]) {
  const normalizedNames = [...new Set(names.map(normalizeLabel))];
  const result = await client.query<WeaponRow>(
    "select id, canonical_name, normalized_name from weapons where normalized_name = any($1::text[]) for update",
    [normalizedNames],
  );
  return result.rows;
}

async function mergeWeapon(client: pg.PoolClient, duplicate: WeaponRow, target: WeaponRow) {
  const sourceBuilds = await client.query<{
    id: string; creator_id: string; game_mode: string; normalized_build_name: string;
  }>(
    `select id, creator_id, game_mode, normalized_build_name
     from weapon_builds where normalized_weapon = $1 for update`,
    [duplicate.normalized_name],
  );
  let buildsMerged = 0;
  let buildsRenamed = 0;
  for (const sourceBuild of sourceBuilds.rows) {
    const targetBuild = await client.query<{ id: string }>(
      `select id from weapon_builds
       where creator_id = $1 and game_mode = $2 and normalized_weapon = $3 and normalized_build_name = $4
       for update`,
      [sourceBuild.creator_id, sourceBuild.game_mode, target.normalized_name, sourceBuild.normalized_build_name],
    );
    if (!targetBuild.rows[0]) {
      await client.query(
        `update weapon_builds set weapon_name = $2, normalized_weapon = $3, updated_at = now()
         where id = $1`,
        [sourceBuild.id, target.canonical_name, target.normalized_name],
      );
      buildsRenamed += 1;
      continue;
    }

    const targetBuildId = targetBuild.rows[0].id;
    const versions = await client.query<{
      id: string; code: string; first_seen_at: Date; last_seen_at: Date; source_published_at: Date | null;
    }>(
      `select id, code, first_seen_at, last_seen_at, source_published_at
       from weapon_build_versions where build_id = $1 order by version for update`,
      [sourceBuild.id],
    );
    for (const version of versions.rows) {
      const existingVersion = await client.query<{ id: string }>(
        "select id from weapon_build_versions where build_id = $1 and code = $2 for update",
        [targetBuildId, version.code],
      );
      if (existingVersion.rows[0]) {
        await client.query(
          `insert into version_sources (version_id, source_content_id, first_seen_at, last_seen_at)
           select $2, source_content_id, first_seen_at, last_seen_at
           from version_sources where version_id = $1
           on conflict (version_id, source_content_id) do update
             set first_seen_at = least(version_sources.first_seen_at, excluded.first_seen_at),
                 last_seen_at = greatest(version_sources.last_seen_at, excluded.last_seen_at)`,
          [version.id, existingVersion.rows[0].id],
        );
        await client.query(
          `update weapon_build_versions
           set first_seen_at = least(first_seen_at, $2),
               last_seen_at = greatest(last_seen_at, $3),
               source_published_at = case
                 when $4::timestamptz is null then source_published_at
                 when source_published_at is null then $4
                 else greatest(source_published_at, $4) end
           where id = $1`,
          [existingVersion.rows[0].id, version.first_seen_at, version.last_seen_at, version.source_published_at],
        );
        await client.query("delete from weapon_build_versions where id = $1", [version.id]);
      } else {
        const next = await client.query<{ version: number }>(
          "select coalesce(max(version), 0)::integer + 1 version from weapon_build_versions where build_id = $1",
          [targetBuildId],
        );
        await client.query(
          "update weapon_build_versions set build_id = $2, version = $3 where id = $1",
          [version.id, targetBuildId, next.rows[0].version],
        );
      }
    }
    await client.query("delete from weapon_builds where id = $1", [sourceBuild.id]);
    await client.query(
      `with latest as (
         select version, source_published_at from weapon_build_versions
         where build_id = $1
         order by source_published_at desc nulls last, version desc limit 1
       )
       update weapon_builds set current_version = latest.version,
         latest_source_published_at = latest.source_published_at, updated_at = now()
       from latest where id = $1`,
      [targetBuildId],
    );
    buildsMerged += 1;
  }

  await client.query(
    `update extraction_candidates
     set weapon_id = $2, weapon_name = $3, normalized_weapon = $4
     where weapon_id = $1`,
    [duplicate.id, target.id, target.canonical_name, target.normalized_name],
  );
  await client.query(
    "update weapon_discoveries set resolved_weapon_id = $2 where resolved_weapon_id = $1",
    [duplicate.id, target.id],
  );
  await client.query("update weapon_aliases set weapon_id = $2 where weapon_id = $1", [duplicate.id, target.id]);
  await client.query(
    `insert into weapon_aliases (weapon_id, alias, normalized_alias) values ($1, $2, $3)
     on conflict (normalized_alias) do update set weapon_id = excluded.weapon_id`,
    [target.id, duplicate.canonical_name, duplicate.normalized_name],
  );
  await client.query("delete from weapons where id = $1", [duplicate.id]);
  return { buildsMerged, buildsRenamed };
}

async function syncCatalog() {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    let inserted = 0;
    let updated = 0;
    let merged = 0;
    let buildsMerged = 0;
    let buildsRenamed = 0;
    let referencesRenamed = 0;
    let aliasesInserted = 0;

    for (const seed of OFFICIAL_WEAPON_CATALOG) {
      const desiredNormalized = normalizeLabel(seed.canonicalName);
      const matches = await findWeapons(client, [seed.canonicalName, ...(seed.mergeNames ?? [])]);
      let target = matches.find((row) => row.normalized_name === desiredNormalized);

      if (!target) {
        const reusable = matches[0];
        if (reusable) {
          const previousNormalizedName = reusable.normalized_name;
          await client.query(
            `update weapons set canonical_name = $2, normalized_name = $3, weapon_type = $4,
               introduced_season = $5, status = 'confirmed', updated_at = now()
             where id = $1`,
            [reusable.id, seed.canonicalName, desiredNormalized, seed.weaponType, seed.introducedSeason],
          );
          if (previousNormalizedName !== desiredNormalized) {
            const candidates = await client.query(
              `update extraction_candidates
               set weapon_name = $2, normalized_weapon = $3
               where weapon_id = $1`,
              [reusable.id, seed.canonicalName, desiredNormalized],
            );
            const builds = await client.query(
              `update weapon_builds
               set weapon_name = $2, normalized_weapon = $3, updated_at = now()
               where normalized_weapon = $1`,
              [previousNormalizedName, seed.canonicalName, desiredNormalized],
            );
            referencesRenamed += (candidates.rowCount ?? 0) + (builds.rowCount ?? 0);
          }
          target = { id: reusable.id, canonical_name: seed.canonicalName, normalized_name: desiredNormalized };
          updated += 1;
        } else {
          const created = await client.query<WeaponRow>(
            `insert into weapons (canonical_name, normalized_name, weapon_type, introduced_season, status)
             values ($1, $2, $3, $4, 'confirmed')
             returning id, canonical_name, normalized_name`,
            [seed.canonicalName, desiredNormalized, seed.weaponType, seed.introducedSeason],
          );
          target = created.rows[0];
          inserted += 1;
        }
      } else {
        await client.query(
          `update weapons set canonical_name = $2, weapon_type = $3, introduced_season = $4,
             status = 'confirmed', updated_at = now() where id = $1`,
          [target.id, seed.canonicalName, seed.weaponType, seed.introducedSeason],
        );
        target = { ...target, canonical_name: seed.canonicalName };
        updated += 1;
      }

      for (const duplicate of matches.filter((row) => row.id !== target.id)) {
        const buildResult = await mergeWeapon(client, duplicate, target);
        buildsMerged += buildResult.buildsMerged;
        buildsRenamed += buildResult.buildsRenamed;
        merged += 1;
      }

      const aliases = [...new Set([seed.canonicalName, ...(seed.aliases ?? [])])];
      for (const alias of aliases) {
        const normalizedAlias = normalizeLabel(alias);
        const owner = await client.query<{ weapon_id: string; canonical_name: string }>(
          `select wa.weapon_id, w.canonical_name
           from weapon_aliases wa join weapons w on w.id = wa.weapon_id
           where wa.normalized_alias = $1`,
          [normalizedAlias],
        );
        if (owner.rows[0] && owner.rows[0].weapon_id !== target.id) {
          throw new Error(`别名“${alias}”已属于未纳入合并规则的武器 ${owner.rows[0].canonical_name}`);
        }
        const result = await client.query(
          `insert into weapon_aliases (weapon_id, alias, normalized_alias)
           values ($1, $2, $3)
           on conflict (normalized_alias) do update set alias = excluded.alias
           where weapon_aliases.weapon_id = excluded.weapon_id`,
          [target.id, alias, normalizedAlias],
        );
        aliasesInserted += result.rowCount ?? 0;
      }
    }

    let invalidRemoved = 0;
    let invalidBuildsRemoved = 0;
    for (const invalidName of INVALID_LEGACY_WEAPON_NAMES) {
      const invalid = await findWeapons(client, [invalidName]);
      for (const row of invalid) {
        await client.query(
          `update extraction_candidates
           set weapon_id = null, weapon_name = null, normalized_weapon = null,
               attribution_status = 'unresolved', weapon_confidence = 0,
               status = case when status = 'accepted' then 'pending' else status end,
               reviewed_by = case when status = 'accepted' then null else reviewed_by end,
               reviewed_at = case when status = 'accepted' then null else reviewed_at end
           where weapon_id = $1`,
          [row.id],
        );
        await client.query("update weapon_discoveries set resolved_weapon_id = null, status = 'pending' where resolved_weapon_id = $1", [row.id]);
        const builds = await client.query<{ id: string }>(
          "select id from weapon_builds where normalized_weapon = $1 for update",
          [row.normalized_name],
        );
        if (builds.rows.length) {
          const buildIds = builds.rows.map((build) => build.id);
          await client.query(
            `delete from version_sources where version_id in
             (select id from weapon_build_versions where build_id = any($1::uuid[]))`,
            [buildIds],
          );
          await client.query("delete from weapon_build_versions where build_id = any($1::uuid[])", [buildIds]);
          await client.query("delete from weapon_builds where id = any($1::uuid[])", [buildIds]);
          invalidBuildsRemoved += buildIds.length;
        }
        await client.query("delete from weapons where id = $1", [row.id]);
        invalidRemoved += 1;
      }
    }

    const officialNames = OFFICIAL_WEAPON_CATALOG.map((seed) => normalizeLabel(seed.canonicalName));
    const unexpected = await client.query<{ canonical_name: string }>(
      "select canonical_name from weapons where status <> 'retired' and not (normalized_name = any($1::text[])) order by canonical_name",
      [officialNames],
    );

    const details = { mode: dryRun ? "dry-run" : "apply", catalogSize: OFFICIAL_WEAPON_CATALOG.length, inserted, updated, merged, buildsMerged, buildsRenamed, referencesRenamed, invalidRemoved, invalidBuildsRemoved, aliasesInserted, unexpected: unexpected.rows.map((row) => row.canonical_name) };
    await client.query(
      `insert into audit_logs (action, entity_type, entity_id, details)
       values ('weapon.catalog_synced', 'weapon_catalog', 'official-s1-s11', $1::jsonb)`,
      [JSON.stringify(details)],
    );
    if (dryRun) await client.query("rollback");
    else await client.query("commit");
    return details;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

const result = await syncCatalog();
console.log(JSON.stringify({ event: "weapon.catalog_synced", ...result }));
await getPool().end();
