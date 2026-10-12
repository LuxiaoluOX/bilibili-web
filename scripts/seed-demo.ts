import { getPool, query, transaction } from "../app/lib/db.server";
import { parseWeaponCodes } from "../app/lib/parser";
import { acceptCandidate } from "../app/lib/crawler.server";
import { getWeaponCatalog } from "../app/lib/weapon-catalog.server";

const adminUsername = (process.env.ADMIN_USERNAME ?? "admin").trim().toLowerCase();
const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase() || null;
const admin = await query<{ id: string }>(
  `select id from users
   where role = 'admin' and is_active = true and deleted_at is null
     and (lower(username) = $1 or ($2::text is not null and lower(email) = $2))
   order by case when lower(username) = $1 then 0 else 1 end
   limit 1`,
  [adminUsername, adminEmail],
);
const adminId = admin.rows[0]?.id;
if (!adminId) throw new Error("请先运行 npm run db:admin");

const creators = [
  ["1177598428", "Roblox-qiqipei"],
  ["223344556", "Always聪聪"],
  ["1029791091", "菜莹也很酷"],
];

for (const [mid, name] of creators) {
  await query(
    `insert into creators (bilibili_mid, name, next_run_at) values ($1, $2, now() + interval '35 minutes')
     on conflict (bilibili_mid) do update set name = excluded.name, enabled = true, deleted_at = null`, [mid, name],
  );
}

const creator = await query<{ id: string }>("select id from creators where bilibili_mid = 223344556");
const creatorId = creator.rows[0].id;
const video = await query<{ id: string }>(
  `insert into videos (creator_id, bvid, aid, title, cover_url, description, published_at, source_url)
   values ($1, 'BV1DEMO437', 437, '三角洲行动 K437 改枪方案合集', null, $2, now() - interval '2 days', 'https://www.bilibili.com/video/BV1DEMO437')
   on conflict (bvid) do update set description = excluded.description returning id`,
  [creatorId, "K437 性价比中高改32万 - 6KURTQC07FI7MVPVB9B3H\nK437 顶配满改A 突令沙暴 - 6KURV0007FI7MVPVB9B3H\nK437 顶配倍镜版 - 6KUS06G07FI7MVPVB9B3H"],
);

const raw = "K437 性价比中高改32万 - 6KURTQC07FI7MVPVB9B3H\nK437 顶配满改A 突令沙暴 - 6KURV0007FI7MVPVB9B3H\nK437 顶配倍镜版 - 6KUS06G07FI7MVPVB9B3H";
const weaponCatalog = await getWeaponCatalog();
const source = await query<{ id: string }>(
  `insert into source_contents (video_id, source_type, external_id, raw_text, content_hash, source_url)
   values ($1, 'video_description', 'description:BV1DEMO437', $2, encode(digest($2, 'sha256'), 'hex'), 'https://www.bilibili.com/video/BV1DEMO437')
   on conflict (source_type, external_id) do update set raw_text = excluded.raw_text returning id`, [video.rows[0].id, raw],
);

for (const [index, candidate] of parseWeaponCodes(raw, "video_description", weaponCatalog).entries()) {
  const shouldAccept = index === 0;
  const status = "pending";
  const inserted = await query<{ id: string }>(
    `insert into extraction_candidates
     (source_content_id, creator_id, raw_code, normalized_code, weapon_name, normalized_weapon, build_name, normalized_build_name, confidence, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     on conflict (source_content_id, normalized_code) do update set status = excluded.status,
       weapon_name = excluded.weapon_name, normalized_weapon = excluded.normalized_weapon,
       build_name = excluded.build_name, normalized_build_name = excluded.normalized_build_name,
       confidence = excluded.confidence returning id`,
    [source.rows[0].id, creatorId, candidate.rawCode, candidate.normalizedCode, candidate.weaponName, candidate.weaponName,
      candidate.buildName, candidate.buildName?.toUpperCase(), index === 0 ? 0.91 : 0.72 - index * 0.06, status],
  );
  if (shouldAccept) await acceptCandidate(inserted.rows[0].id, adminId);
}

await transaction(async (client) => {
  await client.query(
    `insert into crawl_runs (creator_id, trigger, status, attempt, started_at, finished_at, videos_scanned, candidates_found, requested_by)
     values ($1, 'manual', 'succeeded', 1, now() - interval '8 minutes', now() - interval '2 minutes', 30, 3, $2)`,
    [creatorId, adminId],
  );
});
await getPool().end();
console.log("演示数据已写入");
