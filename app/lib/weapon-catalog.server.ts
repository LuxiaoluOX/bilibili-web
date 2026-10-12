import type pg from "pg";
import { query, transaction } from "./db.server";
import { normalizeLabel, type WeaponCatalogEntry } from "./parser";

type Queryable = Pick<pg.PoolClient, "query">;

export type WeaponDirectoryInput = {
  canonicalName: string;
  weaponType?: string;
  introducedSeason?: string;
  aliases?: string[];
  status?: WeaponCatalogEntry["status"];
};

export async function getWeaponCatalog(client?: Queryable): Promise<WeaponCatalogEntry[]> {
  const runner = client ?? { query };
  const result = await runner.query<{
    id: string; canonical_name: string; normalized_name: string; status: WeaponCatalogEntry["status"]; aliases: string[];
  }>(
    `select w.id, w.canonical_name, w.normalized_name, w.status,
       coalesce(array_agg(wa.alias order by length(wa.alias) desc) filter (where wa.id is not null), '{}') aliases
     from weapons w left join weapon_aliases wa on wa.weapon_id = w.id
     group by w.id order by w.canonical_name`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    canonicalName: row.canonical_name,
    normalizedName: row.normalized_name,
    status: row.status,
    aliases: row.aliases.length ? row.aliases : [row.canonical_name],
  }));
}

export async function listWeaponDirectory() {
  const result = await query<{
    id: string; canonical_name: string; normalized_name: string; weapon_type: string | null; introduced_season: string | null;
    status: WeaponCatalogEntry["status"]; aliases: string[]; updated_at: Date;
  }>(
    `select w.id, w.canonical_name, w.normalized_name, w.weapon_type, w.introduced_season, w.status, w.updated_at,
       coalesce(array_agg(wa.alias order by wa.alias) filter (where wa.id is not null), '{}') aliases
     from weapons w left join weapon_aliases wa on wa.weapon_id = w.id
     group by w.id order by w.status, w.canonical_name`,
  );
  return result.rows.map((row) => ({
    id: row.id, canonicalName: row.canonical_name, normalizedName: row.normalized_name,
    weaponType: row.weapon_type, introducedSeason: row.introduced_season, status: row.status,
    aliases: row.aliases, updatedAt: row.updated_at.toISOString(),
  }));
}

export async function listWeaponDiscoveries() {
  const result = await query<{
    id: string; suggested_name: string; normalized_name: string; occurrences: number; status: string;
    resolved_weapon_id: string | null; source_url: string | null; video_title: string | null; first_seen_at: Date; last_seen_at: Date;
  }>(
    `select wd.id, wd.suggested_name, wd.normalized_name, wd.occurrences, wd.status, wd.resolved_weapon_id,
       sc.source_url, v.title video_title, wd.first_seen_at, wd.last_seen_at
     from weapon_discoveries wd
     left join source_contents sc on sc.id = wd.last_source_content_id
     left join videos v on v.id = sc.video_id
     order by case when wd.status = 'pending' then 0 else 1 end, wd.occurrences desc, wd.last_seen_at desc`,
  );
  return result.rows.map((row) => ({
    id: row.id, suggestedName: row.suggested_name, normalizedName: row.normalized_name,
    occurrences: row.occurrences, status: row.status, resolvedWeaponId: row.resolved_weapon_id,
    sourceUrl: row.source_url, videoTitle: row.video_title,
    firstSeenAt: row.first_seen_at.toISOString(), lastSeenAt: row.last_seen_at.toISOString(),
  }));
}

export async function listPendingWeaponDiscoveries(limit = 3) {
  const result = await query<{
    id: string; suggested_name: string; normalized_name: string; occurrences: number; status: string;
    resolved_weapon_id: string | null; source_url: string | null; video_title: string | null; first_seen_at: Date; last_seen_at: Date;
  }>(
    `select wd.id, wd.suggested_name, wd.normalized_name, wd.occurrences, wd.status, wd.resolved_weapon_id,
       sc.source_url, v.title video_title, wd.first_seen_at, wd.last_seen_at
     from weapon_discoveries wd
     left join source_contents sc on sc.id = wd.last_source_content_id
     left join videos v on v.id = sc.video_id
     where wd.status = 'pending'
     order by wd.occurrences desc, wd.last_seen_at desc
     limit $1`, [Math.max(1, Math.min(limit, 20))],
  );
  return result.rows.map((row) => ({
    id: row.id, suggestedName: row.suggested_name, normalizedName: row.normalized_name,
    occurrences: row.occurrences, status: row.status, resolvedWeaponId: row.resolved_weapon_id,
    sourceUrl: row.source_url, videoTitle: row.video_title,
    firstSeenAt: row.first_seen_at.toISOString(), lastSeenAt: row.last_seen_at.toISOString(),
  }));
}

export async function recordWeaponDiscovery(client: pg.PoolClient, suggestedName: string, sourceContentId: string) {
  const normalized = normalizeLabel(suggestedName);
  await client.query(
    `insert into weapon_discoveries
       (suggested_name, normalized_name, first_source_content_id, last_source_content_id)
     values ($1, $2, $3, $3)
     on conflict (normalized_name) do update
       set suggested_name = excluded.suggested_name,
           last_source_content_id = excluded.last_source_content_id,
           last_seen_at = now()`,
    [suggestedName, normalized, sourceContentId],
  );
  await client.query(
    `update weapon_discoveries set occurrences = (
       select count(*)::integer from extraction_candidates
       where upper(regexp_replace(trim(suggested_weapon), '\\s+', ' ', 'g')) = $1
     ) where normalized_name = $1`,
    [normalized],
  );
}

async function ensureAlias(client: pg.PoolClient, weaponId: string, alias: string) {
  const normalized = normalizeLabel(alias);
  await client.query(
    `insert into weapon_aliases (weapon_id, alias, normalized_alias) values ($1, $2, $3)
     on conflict (normalized_alias) do update set weapon_id = excluded.weapon_id, alias = excluded.alias`,
    [weaponId, alias.trim(), normalized],
  );
}

function normalizeWeaponInput(input: WeaponDirectoryInput) {
  const canonicalName = input.canonicalName.trim();
  if (!canonicalName) throw new Error("请输入标准武器名");
  if (canonicalName.length > 80) throw new Error("标准武器名不能超过 80 个字符");
  const aliases = [...new Set((input.aliases ?? []).map((alias) => alias.trim()).filter(Boolean))];
  if (aliases.some((alias) => alias.length > 80)) throw new Error("单个别名不能超过 80 个字符");
  const status = input.status ?? "confirmed";
  if (!["confirmed", "provisional", "retired"].includes(status)) throw new Error("武器状态无效");
  return {
    canonicalName,
    normalizedName: normalizeLabel(canonicalName),
    weaponType: input.weaponType?.trim() || null,
    introducedSeason: input.introducedSeason?.trim() || null,
    aliases,
    status,
  };
}

async function assertAliasesAvailable(client: pg.PoolClient, aliases: string[], weaponId?: string) {
  const normalizedAliases = aliases.map(normalizeLabel);
  const conflict = await client.query<{ alias: string; canonical_name: string }>(
    `select wa.alias, w.canonical_name
     from weapon_aliases wa join weapons w on w.id = wa.weapon_id
     where wa.normalized_alias = any($1::text[]) and ($2::uuid is null or wa.weapon_id <> $2)
     limit 1`,
    [normalizedAliases, weaponId ?? null],
  );
  if (conflict.rows[0]) throw new Error(`别名“${conflict.rows[0].alias}”已属于 ${conflict.rows[0].canonical_name}`);
}

export async function createWeapon(input: WeaponDirectoryInput, actorId: string) {
  const normalized = normalizeWeaponInput(input);
  return transaction(async (client) => {
    const desiredAliases = [...new Set([normalized.canonicalName, ...normalized.aliases])];
    await assertAliasesAvailable(client, desiredAliases);
    const existing = await client.query("select 1 from weapons where normalized_name = $1", [normalized.normalizedName]);
    if (existing.rowCount) throw new Error("该标准武器名已经存在");
    const weapon = await client.query<{ id: string }>(
      `insert into weapons (canonical_name, normalized_name, weapon_type, introduced_season, status, created_by)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [normalized.canonicalName, normalized.normalizedName, normalized.weaponType, normalized.introducedSeason, normalized.status, actorId],
    );
    for (const alias of desiredAliases) await ensureAlias(client, weapon.rows[0].id, alias);
    await client.query(
      `insert into audit_logs (actor_id, action, entity_type, entity_id, details)
       values ($1, 'weapon.created', 'weapon', $2, $3::jsonb)`,
      [actorId, weapon.rows[0].id, JSON.stringify({ canonicalName: normalized.canonicalName, aliases: desiredAliases })],
    );
    return weapon.rows[0].id;
  });
}

export async function updateWeapon(weaponId: string, input: WeaponDirectoryInput, actorId: string) {
  const normalized = normalizeWeaponInput(input);
  return transaction(async (client) => {
    const existing = await client.query<{ canonical_name: string; normalized_name: string }>(
      "select canonical_name, normalized_name from weapons where id = $1 for update",
      [weaponId],
    );
    const previous = existing.rows[0];
    if (!previous) throw new Error("武器不存在或已删除");
    const duplicate = await client.query(
      "select 1 from weapons where normalized_name = $1 and id <> $2",
      [normalized.normalizedName, weaponId],
    );
    if (duplicate.rowCount) throw new Error("该标准武器名已经存在");

    const desiredAliases = [...new Set([
      normalized.canonicalName,
      ...normalized.aliases,
      ...(previous.normalized_name !== normalized.normalizedName ? [previous.canonical_name] : []),
    ])];
    await assertAliasesAvailable(client, desiredAliases, weaponId);
    await client.query(
      `update weapons set canonical_name = $2, normalized_name = $3, weapon_type = $4,
         introduced_season = $5, status = $6, updated_at = now()
       where id = $1`,
      [weaponId, normalized.canonicalName, normalized.normalizedName, normalized.weaponType, normalized.introducedSeason, normalized.status],
    );
    await client.query(
      `update extraction_candidates set weapon_name = $2, normalized_weapon = $3
       where weapon_id = $1`,
      [weaponId, normalized.canonicalName, normalized.normalizedName],
    );
    await client.query(
      `update weapon_builds set weapon_name = $2, normalized_weapon = $3, updated_at = now()
       where normalized_weapon = $1`,
      [previous.normalized_name, normalized.canonicalName, normalized.normalizedName],
    );
    const normalizedAliases = desiredAliases.map(normalizeLabel);
    await client.query(
      "delete from weapon_aliases where weapon_id = $1 and not (normalized_alias = any($2::text[]))",
      [weaponId, normalizedAliases],
    );
    for (const alias of desiredAliases) await ensureAlias(client, weaponId, alias);
    await client.query(
      `insert into audit_logs (actor_id, action, entity_type, entity_id, details)
       values ($1, 'weapon.updated', 'weapon', $2, $3::jsonb)`,
      [actorId, weaponId, JSON.stringify({ previousName: previous.canonical_name, canonicalName: normalized.canonicalName, aliases: desiredAliases, status: normalized.status })],
    );
  });
}

export async function resolveWeaponDiscovery(input: {
  discoveryId: string; reviewerId: string; weaponId?: string; canonicalName?: string; weaponType?: string; introducedSeason?: string;
}) {
  return transaction(async (client) => {
    const discovery = await client.query<{ id: string; suggested_name: string; normalized_name: string }>(
      "select id, suggested_name, normalized_name from weapon_discoveries where id = $1 for update", [input.discoveryId],
    );
    const row = discovery.rows[0];
    if (!row) throw new Error("待确认武器不存在");

    let weaponId = input.weaponId;
    let canonicalName: string;
    if (weaponId) {
      const weapon = await client.query<{ canonical_name: string }>("select canonical_name from weapons where id = $1", [weaponId]);
      if (!weapon.rows[0]) throw new Error("目标武器不存在");
      canonicalName = weapon.rows[0].canonical_name;
    } else {
      canonicalName = input.canonicalName?.trim() || row.suggested_name;
      const normalizedName = normalizeLabel(canonicalName);
      const weapon = await client.query<{ id: string }>(
        `insert into weapons (canonical_name, normalized_name, weapon_type, introduced_season, status, created_by)
         values ($1, $2, $3, $4, 'confirmed', $5)
         on conflict (normalized_name) do update set canonical_name = excluded.canonical_name,
           weapon_type = coalesce(excluded.weapon_type, weapons.weapon_type),
           introduced_season = coalesce(excluded.introduced_season, weapons.introduced_season),
           status = 'confirmed', updated_at = now()
         returning id`,
        [canonicalName, normalizedName, input.weaponType?.trim() || null, input.introducedSeason?.trim() || null, input.reviewerId],
      );
      weaponId = weapon.rows[0].id;
      await ensureAlias(client, weaponId, canonicalName);
    }
    await ensureAlias(client, weaponId, row.suggested_name);
    await client.query(
      `update weapon_discoveries set status = $2, resolved_weapon_id = $3, reviewed_by = $4, reviewed_at = now()
       where id = $1`,
      [row.id, input.weaponId ? "mapped" : "confirmed", weaponId, input.reviewerId],
    );
    await client.query(
      `insert into audit_logs (actor_id, action, entity_type, entity_id, details)
       values ($1, 'weapon.discovery_resolved', 'weapon_discovery', $2, $3::jsonb)`,
      [input.reviewerId, row.id, JSON.stringify({ suggestedName: row.suggested_name, canonicalName, weaponId })],
    );
    return { weaponId, canonicalName };
  });
}

export async function rejectWeaponDiscovery(discoveryId: string, reviewerId: string) {
  await transaction(async (client) => {
    await client.query(
      `update weapon_discoveries set status = 'rejected', reviewed_by = $2, reviewed_at = now() where id = $1`,
      [discoveryId, reviewerId],
    );
    await client.query(
      `insert into audit_logs (actor_id, action, entity_type, entity_id) values ($1, 'weapon.discovery_rejected', 'weapon_discovery', $2)`,
      [reviewerId, discoveryId],
    );
  });
}

export async function importWeaponDirectory(raw: string, actorId: string) {
  const rows = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!rows.length) throw new Error("请输入至少一行武器数据");
  return transaction(async (client) => {
    let count = 0;
    for (const line of rows) {
      const [name, weaponType, season, aliasText] = line.split("|").map((item) => item.trim());
      if (!name) continue;
      const normalizedName = normalizeLabel(name);
      const aliases = [...new Set([name, ...(aliasText ? aliasText.split(/[，,]/).map((item) => item.trim()) : [])].filter(Boolean))];
      const existing = await client.query<{ id: string }>(
        "select id from weapons where normalized_name = $1 for update",
        [normalizedName],
      );
      await assertAliasesAvailable(client, aliases, existing.rows[0]?.id);
      const weapon = await client.query<{ id: string }>(
        `insert into weapons (canonical_name, normalized_name, weapon_type, introduced_season, created_by)
         values ($1, $2, $3, $4, $5)
         on conflict (normalized_name) do update set canonical_name = excluded.canonical_name,
           weapon_type = coalesce(excluded.weapon_type, weapons.weapon_type),
           introduced_season = coalesce(excluded.introduced_season, weapons.introduced_season), updated_at = now()
         returning id`,
        [name, normalizedName, weaponType || null, season || null, actorId],
      );
      for (const alias of aliases) {
        await ensureAlias(client, weapon.rows[0].id, alias);
      }
      count += 1;
    }
    await client.query(
      `insert into audit_logs (actor_id, action, entity_type, details) values ($1, 'weapon.directory_imported', 'weapon', $2::jsonb)`,
      [actorId, JSON.stringify({ count })],
    );
    return count;
  });
}
