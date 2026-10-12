import { CheckOutlined, CloseOutlined, DownOutlined, EditOutlined, HistoryOutlined, ImportOutlined, PlusOutlined, RightOutlined, SearchOutlined } from "@ant-design/icons";
import { Alert, Empty, Input, Segmented, Select, Space, Tabs, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Key } from "react";
import { useEffect, useMemo, useState } from "react";
import { data, Form, useFetcher, useSearchParams } from "react-router";
import type { Route } from "./+types/builds";
import { ActionButton, ActionGroup, ConfirmAction } from "../components/actions";
import { CodeValue, CountTag, StatusBadge, tablePagination, WorkbenchProTable } from "../components/data-display";
import { useFetcherToast } from "../components/feedback";
import { DataToolbar, FormError, FormModal } from "../components/forms";
import { PageHeader } from "../components/layout";
import { requireRole, requireUser } from "../lib/auth.server";
import { audit } from "../lib/audit.server";
import { reparseStoredSources } from "../lib/crawler.server";
import { canOperate } from "../lib/domain";
import { assignUnknownBuildsToMode } from "../lib/game-mode-governance.server";
import { getGameModeIntegrity } from "../lib/game-mode-integrity.server";
import { CODE_GAME_MODE_OPTIONS, GAME_MODE_LABELS, isCodeGameMode, isGameMode, type CodeGameMode, type GameMode } from "../lib/game-modes";
import { listBuilds, listGameSeasons } from "../lib/repository.server";
import { effectiveSeasonForCodes, formatSeasonRange, seasonDisplayName, seasonForDate, type GameSeason } from "../lib/seasons";
import { createWeapon, importWeaponDirectory, listWeaponDirectory, listWeaponDiscoveries, rejectWeaponDiscovery, resolveWeaponDiscovery, updateWeapon } from "../lib/weapon-catalog.server";

export function meta() { return [{ title: "武器码字典 · 三角洲行动数据中台" }]; }

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const requestedMode = url.searchParams.get("gameMode");
  const gameMode: GameMode = isGameMode(requestedMode) ? requestedMode : "operations";
  const [builds, weapons, discoveries, seasons, modeIntegrity] = await Promise.all([
    listBuilds(q, gameMode),
    listWeaponDirectory(),
    listWeaponDiscoveries(),
    listGameSeasons(),
    getGameModeIntegrity(),
  ]);
  return { user, builds, weapons, discoveries, seasons, modeIntegrity, q, gameMode, capturedAt: new Date().toISOString() };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireRole(request, ["admin", "operator"]);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  try {
    if (intent === "assign-build-mode") {
      const targetMode = form.get("targetMode");
      const buildIds = form.getAll("buildId").map(String).filter((value) => /^[0-9a-f-]{36}$/i.test(value));
      if (!isCodeGameMode(targetMode)) return data({ ok: false, message: "请选择有效的目标模式" }, { status: 400 });
      if (!buildIds.length) return data({ ok: false, message: "请至少选择一个待归类方案" }, { status: 400 });
      const count = await assignUnknownBuildsToMode(buildIds, targetMode);
      await audit(user.id, "builds.game-mode.assigned", "weapon_build", undefined, { buildIds, targetMode, count });
      return data({ ok: true, message: `已将 ${count} 个方案归入${GAME_MODE_LABELS[targetMode]}` });
    }
    if (intent === "reject-discovery") {
      await rejectWeaponDiscovery(String(form.get("discoveryId")), user.id);
      return data({ ok: true, message: "已忽略该误识别项" });
    }
    if (intent === "confirm-discovery" || intent === "map-discovery") {
      await resolveWeaponDiscovery({
        discoveryId: String(form.get("discoveryId")), reviewerId: user.id,
        weaponId: intent === "map-discovery" ? String(form.get("weaponId")) : undefined,
        canonicalName: String(form.get("canonicalName") ?? ""), weaponType: String(form.get("weaponType") ?? ""),
        introducedSeason: String(form.get("introducedSeason") ?? ""),
      });
      const reparsed = await reparseStoredSources();
      return data({ ok: true, message: `武器归属已生效，并重解析 ${reparsed.sourcesScanned} 条历史简介` });
    }
    if (intent === "import-weapons") {
      const count = await importWeaponDirectory(String(form.get("directory") ?? ""), user.id);
      const reparsed = await reparseStoredSources();
      return data({ ok: true, message: `已导入 ${count} 个武器，并重解析 ${reparsed.sourcesScanned} 条历史简介` });
    }
    if (intent === "create-weapon" || intent === "update-weapon") {
      const status = String(form.get("status") ?? "confirmed") as "confirmed" | "provisional" | "retired";
      const weaponInput = {
        canonicalName: String(form.get("canonicalName") ?? ""),
        weaponType: String(form.get("weaponType") ?? ""),
        introducedSeason: String(form.get("introducedSeason") ?? ""),
        aliases: String(form.get("aliases") ?? "").split(/[，,\n]/).map((item) => item.trim()).filter(Boolean),
        status,
      };
      if (intent === "create-weapon") await createWeapon(weaponInput, user.id);
      else await updateWeapon(String(form.get("weaponId") ?? ""), weaponInput, user.id);
      const reparsed = await reparseStoredSources({ publishedSince: new Date("2026-03-01T00:00:00+08:00") });
      return data({ ok: true, message: `${intent === "create-weapon" ? "武器已新增" : "武器已更新"}，并对账 ${reparsed.sourcesScanned} 条三月以来简介` });
    }
    return data({ ok: false, message: "未知操作" }, { status: 400 });
  } catch (error) {
    return data({ ok: false, message: error instanceof Error ? error.message : "操作失败" }, { status: 400 });
  }
}

type Build = Awaited<ReturnType<typeof listBuilds>>[number];
type Weapon = Awaited<ReturnType<typeof listWeaponDirectory>>[number];
type Discovery = Awaited<ReturnType<typeof listWeaponDiscoveries>>[number];
type SeasonBucket = { season: GameSeason; builds: Build[] };
type BuildGroup = {
  id: string;
  weaponName: string;
  weaponType: string | null;
  introducedSeason: string | null;
  aliases: string[];
  builds: Build[];
  creatorNames: string[];
  latestVersion: number;
  sourcePublishedAt: string | null;
  seasonBuckets: SeasonBucket[];
  currentSeason: GameSeason | null;
  effectiveSeason: GameSeason | null;
  effectiveBuildCount: number;
  carriedForward: boolean;
};
type RawBuildGroup = Omit<BuildGroup, "seasonBuckets" | "currentSeason" | "effectiveSeason" | "effectiveBuildCount" | "carriedForward">;

function normalizeWeaponKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleUpperCase("zh-CN");
}

function groupBuilds(builds: Build[], weapons: Weapon[], seasons: GameSeason[], capturedAt: string): BuildGroup[] {
  const weaponLookup = new Map<string, Weapon>();
  for (const weapon of weapons) {
    weaponLookup.set(normalizeWeaponKey(weapon.canonicalName), weapon);
    for (const alias of weapon.aliases) weaponLookup.set(normalizeWeaponKey(alias), weapon);
  }

  const groups = new Map<string, RawBuildGroup>();
  for (const build of builds) {
    const matchedWeapon = weaponLookup.get(normalizeWeaponKey(build.weaponName));
    const weaponName = matchedWeapon?.canonicalName ?? build.weaponName;
    const id = normalizeWeaponKey(weaponName);
    const existing = groups.get(id);
    if (existing) {
      existing.builds.push(build);
      if (!existing.creatorNames.includes(build.creatorName)) existing.creatorNames.push(build.creatorName);
      existing.latestVersion = Math.max(existing.latestVersion, build.currentVersion);
      if (build.sourcePublishedAt && (!existing.sourcePublishedAt || new Date(build.sourcePublishedAt) > new Date(existing.sourcePublishedAt))) existing.sourcePublishedAt = build.sourcePublishedAt;
      continue;
    }
    groups.set(id, {
      id,
      weaponName,
      weaponType: matchedWeapon?.weaponType || null,
      introducedSeason: matchedWeapon?.introducedSeason || null,
      aliases: matchedWeapon?.aliases.filter((alias) => normalizeWeaponKey(alias) !== normalizeWeaponKey(weaponName)) ?? [],
      builds: [build],
      creatorNames: [build.creatorName],
      latestVersion: build.currentVersion,
      sourcePublishedAt: build.sourcePublishedAt,
    });
  }

  const currentSeason = seasonForDate(capturedAt, seasons);
  return [...groups.values()]
    .map((group) => {
      const sortedBuilds = group.builds.sort((a, b) => new Date(b.sourcePublishedAt ?? 0).getTime() - new Date(a.sourcePublishedAt ?? 0).getTime());
      const bucketMap = new Map<string, SeasonBucket>();
      for (const build of sortedBuilds) {
        const season = seasonForDate(build.sourcePublishedAt, seasons);
        if (!season) continue;
        const bucket = bucketMap.get(season.code);
        if (bucket) bucket.builds.push(build);
        else bucketMap.set(season.code, { season, builds: [build] });
      }
      const seasonBuckets = seasons.flatMap((season) => bucketMap.get(season.code) ?? []);
      const effectiveSeason = effectiveSeasonForCodes(currentSeason, seasons, bucketMap.keys());
      const effectiveBucket = effectiveSeason ? bucketMap.get(effectiveSeason.code) ?? null : null;
      return {
        ...group,
        builds: sortedBuilds,
        seasonBuckets,
        currentSeason,
        effectiveSeason: effectiveBucket?.season ?? null,
        effectiveBuildCount: effectiveBucket?.builds.length ?? 0,
        carriedForward: Boolean(currentSeason && effectiveBucket && currentSeason.code !== effectiveBucket.season.code),
      };
    })
    .sort((a, b) => new Date(b.sourcePublishedAt ?? 0).getTime() - new Date(a.sourcePublishedAt ?? 0).getTime());
}

function WeaponBuildPanel({ group, columns }: { group: BuildGroup; columns: ColumnsType<Build> }) {
  const initialSeasonCode = group.effectiveSeason?.code ?? group.seasonBuckets[0]?.season.code ?? "";
  const [selectedSeasonCode, setSelectedSeasonCode] = useState(initialSeasonCode);
  const selectedBucket = group.seasonBuckets.find((bucket) => bucket.season.code === selectedSeasonCode) ?? group.seasonBuckets[0];
  const selectedIsEffective = selectedBucket?.season.code === group.effectiveSeason?.code;

  return <div className="weapon-builds-expanded" onClick={(event) => event.stopPropagation()}>
    <div className="weapon-builds-heading">
      <div className="weapon-builds-title">
        <div><Typography.Text strong>{group.weaponName} 的改枪方案</Typography.Text>
          {selectedIsEffective && group.currentSeason ? <CountTag tone="green">{group.currentSeason.code} 当前采用</CountTag> : <CountTag tone="default">历史赛季</CountTag>}
          {group.carriedForward && selectedIsEffective && selectedBucket ? <CountTag tone="amber">沿用 {selectedBucket.season.code}</CountTag> : null}
        </div>
        <Typography.Text type="secondary">
          {selectedBucket ? `${seasonDisplayName(selectedBucket.season)} · ${formatSeasonRange(selectedBucket.season)}` : "暂无可归属赛季的数据"}
          {group.carriedForward && selectedIsEffective && group.currentSeason ? `；${seasonDisplayName(group.currentSeason)} 暂无新码，沿用该赛季` : ""}
        </Typography.Text>
      </div>
      <div className="weapon-season-picker">
        <Typography.Text type="secondary">赛季时间轴</Typography.Text>
        <Select
          aria-label={`${group.weaponName} 赛季时间轴`}
          value={selectedBucket?.season.code}
          onChange={setSelectedSeasonCode}
          popupMatchSelectWidth={false}
          options={group.seasonBuckets.map((bucket) => ({
            value: bucket.season.code,
            label: `${seasonDisplayName(bucket.season)} · ${bucket.builds.length} 个方案${bucket.season.code === group.effectiveSeason?.code ? " · 当前采用" : ""}`,
          }))}
        />
      </div>
    </div>
    <WorkbenchProTable preferenceKey={`weapon-builds-${group.id}`} rowKey="id" className="weapon-builds-table" columns={columns} dataSource={selectedBucket?.builds ?? []} pagination={false} options={false} scroll={{ x: 1120 }}/>
  </div>;
}

export default function Builds({ loaderData }: Route.ComponentProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher<typeof action>();
  const weaponFetcher = useFetcher<typeof action>();
  useFetcherToast(fetcher, { loading: "正在更新武器数据…" });
  useFetcherToast(weaponFetcher, { loading: "正在保存武器…" });
  const [confirming, setConfirming] = useState<Discovery | null>(null);
  const [mapping, setMapping] = useState<Discovery | null>(null);
  const [importing, setImporting] = useState(false);
  const [editingWeapon, setEditingWeapon] = useState<Weapon | null>(null);
  const [weaponEditorOpen, setWeaponEditorOpen] = useState(false);
  const [weaponAliases, setWeaponAliases] = useState<string[]>([]);
  const [weaponSubmitted, setWeaponSubmitted] = useState(false);
  const buildGroups = useMemo(
    () => groupBuilds(loaderData.builds, loaderData.weapons, loaderData.seasons, loaderData.capturedAt),
    [loaderData.builds, loaderData.weapons, loaderData.seasons, loaderData.capturedAt],
  );
  const groupSignature = buildGroups.map((group) => group.id).join("|");
  const [expandedWeaponKeys, setExpandedWeaponKeys] = useState<Key[]>([]);
  const [selectedUnknownBuildKeys, setSelectedUnknownBuildKeys] = useState<Key[]>([]);
  const editable = canOperate(loaderData.user.role);
  const pending = loaderData.discoveries.filter((item) => item.status === "pending");

  const switchGameMode = (mode: string | number) => {
    if (!isGameMode(mode)) return;
    const next = new URLSearchParams(searchParams);
    next.set("gameMode", mode);
    next.delete("q");
    setSearchParams(next);
  };

  const assignSelectedBuilds = (targetMode: CodeGameMode) => {
    const form = new FormData();
    form.set("intent", "assign-build-mode");
    form.set("targetMode", targetMode);
    for (const key of selectedUnknownBuildKeys) form.append("buildId", String(key));
    fetcher.submit(form, { method: "post" });
  };

  useEffect(() => {
    setExpandedWeaponKeys(loaderData.q ? buildGroups.map((group) => group.id) : buildGroups[0] ? [buildGroups[0].id] : []);
  }, [groupSignature, loaderData.q]);

  useEffect(() => {
    if (!weaponSubmitted || weaponFetcher.state !== "idle" || !weaponFetcher.data?.ok) return;
    setWeaponEditorOpen(false);
    setEditingWeapon(null);
    setWeaponSubmitted(false);
  }, [weaponFetcher.state, weaponFetcher.data, weaponSubmitted]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok && loaderData.gameMode === "unknown") setSelectedUnknownBuildKeys([]);
  }, [fetcher.state, fetcher.data, loaderData.gameMode]);

  const openWeaponEditor = (weapon?: Weapon) => {
    setEditingWeapon(weapon ?? null);
    setWeaponAliases(weapon?.aliases.filter((alias) => normalizeWeaponKey(alias) !== normalizeWeaponKey(weapon.canonicalName)) ?? []);
    setWeaponSubmitted(false);
    setWeaponEditorOpen(true);
  };

  const buildColumns: ColumnsType<Build> = [
    { title: "方案名称", dataIndex: "buildName", fixed: "left", align: "left", render: (value) => <Typography.Text strong>{value}</Typography.Text> },
    { title: "创作者", dataIndex: "creatorName", width: 170, align: "left" },
    { title: "当前改枪码", dataIndex: "code", width: 270, align: "left", render: (value) => <CodeValue value={value} /> },
    { title: "版本", dataIndex: "currentVersion", width: 90, align: "center", render: (value) => <CountTag tone="cyan">v{value}</CountTag> },
    { title: "视频发布时间", dataIndex: "sourcePublishedAt", width: 180, align: "center", render: (value) => value ? new Date(value).toLocaleString("zh-CN") : "—" },
    { title: "操作", fixed: "right", width: 130, align: "center", render: (_, row) => <ActionButton kind="link" scale="row" to={`/builds/${row.id}`} icon={<HistoryOutlined />}>版本历史</ActionButton> },
  ];
  const unknownBuildColumns: ColumnsType<Build> = [
    { title: "武器", dataIndex: "weaponName", fixed: "left", width: 170, align: "left", render: (value) => <Typography.Text strong>{value}</Typography.Text> },
    ...buildColumns,
  ];
  const buildGroupColumns: ColumnsType<BuildGroup> = [
    { title: "武器", dataIndex: "weaponName", fixed: "left", width: 270, align: "left", render: (value, row) => <div className="weapon-group-identity">
      <Typography.Text strong>{value}</Typography.Text>
      <div className="weapon-group-meta">
        {row.weaponType ? <Tag>{row.weaponType}</Tag> : null}
        {row.introducedSeason ? <span>{row.introducedSeason} 加入</span> : null}
      </div>
    </div> },
    { title: "常用别名", dataIndex: "aliases", width: 220, align: "left", render: (values: string[]) => values.length ? <div className="weapon-alias-cell">
      {values.slice(0, 3).map((value) => <Tag key={value}>{value}</Tag>)}
      {values.length > 3 ? <Tooltip title={values.slice(3).join("、")}><span className="weapon-alias-more">+{values.length - 3}</span></Tooltip> : null}
    </div> : <Typography.Text type="secondary">—</Typography.Text> },
    { title: "改枪方案", dataIndex: "builds", width: 150, align: "center", render: (values: Build[], row) => <div className="build-count-stack"><CountTag tone="cyan">{row.effectiveBuildCount} 个当前</CountTag><Typography.Text type="secondary">{values.length} 个总计</Typography.Text></div> },
    { title: "创作者", dataIndex: "creatorNames", align: "left", render: (values: string[]) => <Space size={[5, 5]} wrap>
      {values.slice(0, 3).map((value) => <Tag key={value}>{value}</Tag>)}
      {values.length > 3 ? <Typography.Text type="secondary">+{values.length - 3}</Typography.Text> : null}
    </Space> },
    { title: "当前赛季", dataIndex: "currentSeason", width: 170, align: "center", render: (_, row) => row.currentSeason ? <div className="season-status-stack"><CountTag tone="green">{row.currentSeason.code}</CountTag>{row.carriedForward && row.effectiveSeason ? <Typography.Text type="secondary">沿用 {row.effectiveSeason.code}</Typography.Text> : null}</div> : "—" },
    { title: "最近视频发布", dataIndex: "sourcePublishedAt", width: 180, align: "center", render: (value) => value ? new Date(value).toLocaleString("zh-CN") : "—" },
  ];
  const weaponColumns: ColumnsType<Weapon> = [
    { title: "标准名称", dataIndex: "canonicalName", fixed: "left", width: 160, align: "left", render: (value) => <Typography.Text strong>{value}</Typography.Text> },
    { title: "别名", dataIndex: "aliases", align: "left", render: (values: string[]) => <Space wrap>{values.map((value) => <Tag key={value}>{value}</Tag>)}</Space> },
    { title: "武器类型", dataIndex: "weaponType", width: 140, align: "center", render: (value) => value || "—" },
    { title: "加入赛季", dataIndex: "introducedSeason", width: 140, align: "center", render: (value) => value || "—" },
    { title: "状态", dataIndex: "status", width: 110, align: "center", render: (value) => <StatusBadge status={value === "confirmed" ? "success" : "neutral"} label={value === "confirmed" ? "已确认" : value} /> },
    { title: "操作", fixed: "right", width: 110, align: "center", render: (_, row) => editable
      ? <ActionButton kind="link" scale="row" icon={<EditOutlined />} onClick={() => openWeaponEditor(row)}>修改</ActionButton>
      : <Typography.Text type="secondary">只读</Typography.Text> },
  ];
  const discoveryColumns: ColumnsType<Discovery> = [
    { title: "识别名称", dataIndex: "suggestedName", fixed: "left", width: 160, align: "left", render: (value) => <Typography.Text strong>{value}</Typography.Text> },
    { title: "出现次数", dataIndex: "occurrences", width: 100, align: "center", render: (value) => <CountTag tone="amber">{value} 次</CountTag> },
    { title: "最近来源", dataIndex: "videoTitle", align: "left", render: (value, row) => row.sourceUrl ? <a href={row.sourceUrl} target="_blank" rel="noreferrer">{value || "查看简介"}</a> : "—" },
    { title: "首次发现", dataIndex: "firstSeenAt", width: 180, align: "center", render: (value) => new Date(value).toLocaleString("zh-CN") },
    { title: "操作", fixed: "right", width: 260, align: "center", render: (_, row) => editable ? <ActionGroup compact>
      <ActionButton kind="link" scale="row" icon={<CheckOutlined />} onClick={() => setConfirming(row)}>确认为新武器</ActionButton>
      <ActionButton kind="link" scale="row" onClick={() => setMapping(row)}>映射别名</ActionButton>
      <fetcher.Form method="post"><input type="hidden" name="discoveryId" value={row.id}/><ActionButton kind="danger" scale="row" icon={<CloseOutlined />} htmlType="submit" name="intent" value="reject-discovery">忽略</ActionButton></fetcher.Form>
    </ActionGroup> : "只读" },
  ];

  return <div className="page">
    <PageHeader eyebrow="WEAPON INTELLIGENCE" title="武器码字典" description="动态维护方案版本、标准武器名与赛季新增武器；确认后自动回填历史简介。" actions={editable?<ActionGroup>
      <ActionButton kind="secondary" icon={<ImportOutlined/>} onClick={()=>setImporting(true)}>批量导入武器</ActionButton>
      <ActionButton kind="primary" icon={<PlusOutlined/>} onClick={()=>openWeaponEditor()}>新增武器</ActionButton>
    </ActionGroup>:null} />
    {!loaderData.modeIntegrity.healthy ? <Alert
      className="governance-alert"
      type="error"
      showIcon
      title={`模式数据存在 ${loaderData.modeIntegrity.issueCount} 项待治理问题`}
      description={`未识别：来源 ${loaderData.modeIntegrity.unknownSources}、候选 ${loaderData.modeIntegrity.unknownCandidates}、版本 ${loaderData.modeIntegrity.unknownVersions}、方案 ${loaderData.modeIntegrity.unknownBuilds}；层级不一致：来源/候选 ${loaderData.modeIntegrity.sourceCandidateMismatches}、来源/版本 ${loaderData.modeIntegrity.versionSourceMismatches}、版本/方案 ${loaderData.modeIntegrity.buildVersionMismatches}。`}
    /> : null}
    <Tabs className="task-tabs" items={[
      { key: "builds", label: "改枪方案", children: <>
        <DataToolbar main={<Form method="get" className="data-toolbar-search"><input type="hidden" name="gameMode" value={loaderData.gameMode}/><Input name="q" defaultValue={loaderData.q} prefix={<SearchOutlined />} placeholder={`搜索${GAME_MODE_LABELS[loaderData.gameMode]}的武器、别名、方案或改枪码`} allowClear/><ActionButton kind="secondary" htmlType="submit">搜索</ActionButton></Form>} aside={<div className="build-group-summary">
            <Typography.Text type="secondary">{loaderData.gameMode === "unknown" ? `${loaderData.builds.length} 个待归类方案` : `${buildGroups.length} 种武器 · ${loaderData.builds.length} 个方案`}</Typography.Text>
            {loaderData.gameMode !== "unknown" ? <Space size={4}>
              <ActionButton kind="tertiary" scale="row" onClick={() => setExpandedWeaponKeys([])} disabled={!expandedWeaponKeys.length}>全部收起</ActionButton>
              <ActionButton kind="tertiary" scale="row" onClick={() => setExpandedWeaponKeys(buildGroups.map((group) => group.id))} disabled={expandedWeaponKeys.length === buildGroups.length}>全部展开</ActionButton>
            </Space> : null}
          </div>} />
        {loaderData.gameMode === "unknown" ? <Alert className="governance-alert" type="warning" showIcon title="这些历史方案尚未归属游戏模式" description="选择方案后批量归入正确模式；归类会同步当前方案、版本和对应候选记录。" /> : null}
        <section className={`table-section ${loaderData.gameMode === "unknown" ? "unknown-build-section" : "build-group-section"}`}>
          {loaderData.gameMode === "unknown" ? <WorkbenchProTable
            preferenceKey="unknown-builds"
            rowKey="id"
            columns={unknownBuildColumns}
            dataSource={loaderData.builds}
            rowSelection={editable ? { selectedRowKeys: selectedUnknownBuildKeys, onChange: setSelectedUnknownBuildKeys, preserveSelectedRowKeys: true } : undefined}
            headerTitle={<div className="weapon-mode-toolbar" aria-label="改枪码模式"><Segmented value={loaderData.gameMode} options={[...CODE_GAME_MODE_OPTIONS, { value: "unknown", label: "未识别模式" }]} onChange={switchGameMode}/></div>}
            toolBarRender={() => editable ? [<div className="governance-actions" key="governance-actions"><Typography.Text type="secondary">已选 {selectedUnknownBuildKeys.length} 个</Typography.Text>{CODE_GAME_MODE_OPTIONS.map((option) => <ConfirmAction key={option.value} title={`归入${option.label}？`} description={`将同步更新所选 ${selectedUnknownBuildKeys.length} 个方案及其版本记录。`} confirmText="确认归类" disabled={!selectedUnknownBuildKeys.length} onConfirm={() => assignSelectedBuilds(option.value)} kind={option.value === "operations" ? "primary" : "secondary"} loading={fetcher.state !== "idle"}>归入{option.label}</ConfirmAction>)}</div>] : []}
            locale={{ emptyText: <Empty description={loaderData.q ? "没有匹配的未识别方案" : "所有方案都已完成模式归类"}/> }}
            pagination={tablePagination(20, "个方案")}
            scroll={{ x: 1240 }}
          /> :
          <WorkbenchProTable
            preferenceKey="build-groups"
            rowKey="id"
            columns={buildGroupColumns}
            dataSource={buildGroups}
            headerTitle={<div className="weapon-mode-toolbar" aria-label="改枪码模式">
              <Segmented value={loaderData.gameMode} options={[...CODE_GAME_MODE_OPTIONS, { value: "unknown", label: "未识别模式" }]} onChange={switchGameMode}/>
            </div>}
            locale={{ emptyText: <Empty description={loaderData.q ? `没有匹配的${GAME_MODE_LABELS[loaderData.gameMode]}武器或方案` : `${GAME_MODE_LABELS[loaderData.gameMode]}暂无正式改枪方案`}/> }}
            pagination={{ ...tablePagination(10, "种武器"), showSizeChanger: buildGroups.length > 20, pageSizeOptions: [10, 20, 50] }}
            expandable={{
              columnWidth: 54,
              expandedRowKeys: expandedWeaponKeys,
              onExpandedRowsChange: (keys) => setExpandedWeaponKeys([...keys]),
              expandRowByClick: true,
              expandIcon: ({ expanded, onExpand, record }) => <ActionButton
                kind="tertiary"
                scale="icon"
                className="weapon-expand-button"
                icon={expanded ? <DownOutlined /> : <RightOutlined />}
                aria-label={expanded ? `收起 ${record.weaponName} 的改枪方案` : `展开 ${record.weaponName} 的改枪方案`}
                aria-expanded={expanded}
                onClick={(event) => onExpand(record, event)}
              />,
              rowExpandable: (row) => row.builds.length > 0,
              expandedRowRender: (row) => <WeaponBuildPanel key={`${row.id}:${row.effectiveSeason?.code ?? "none"}`} group={row} columns={buildColumns}/>,
            }}
            scroll={{ x: 1190 }}
          />
          }
        </section>
      </> },
      { key: "weapons", label: `武器目录 (${loaderData.weapons.length})`, children: <section className="table-section"><WorkbenchProTable preferenceKey="weapon-directory" rowKey="id" columns={weaponColumns} dataSource={loaderData.weapons} scroll={{x:1040}} pagination={tablePagination(12, "种武器")}/></section> },
      { key: "discoveries", label: <span>待确认新武器 <CountTag tone={pending.length ? "amber" : "default"}>{pending.length}</CountTag></span>, children: <section className="table-section"><WorkbenchProTable preferenceKey="weapon-discoveries" rowKey="id" columns={discoveryColumns} dataSource={pending} scroll={{x:1000}} pagination={tablePagination(12, "条待确认武器")} locale={{emptyText:<Empty description="暂无待确认武器"/>}}/></section> },
    ]}/>
    <FormModal title={`确认新武器 · ${confirming?.suggestedName ?? ""}`} open={Boolean(confirming)} onClose={()=>setConfirming(null)}>
      {confirming?<fetcher.Form method="post" onSubmit={()=>setConfirming(null)}><input type="hidden" name="intent" value="confirm-discovery"/><input type="hidden" name="discoveryId" value={confirming.id}/><Typography.Text className="field-label">标准武器名</Typography.Text><Input name="canonicalName" defaultValue={confirming.suggestedName}/><Typography.Text className="field-label">武器类型（可选）</Typography.Text><Input name="weaponType" placeholder="例如：突击步枪"/><Typography.Text className="field-label">加入赛季（可选）</Typography.Text><Input name="introducedSeason" placeholder="例如：S11"/><ActionButton className="modal-submit" kind="primary" htmlType="submit" block loading={fetcher.state!=="idle"}>确认并回填历史数据</ActionButton></fetcher.Form>:null}
    </FormModal>
    <FormModal title={`映射已有武器 · ${mapping?.suggestedName ?? ""}`} open={Boolean(mapping)} onClose={()=>setMapping(null)}>
      {mapping?<fetcher.Form method="post" onSubmit={()=>setMapping(null)}><input type="hidden" name="intent" value="map-discovery"/><input type="hidden" name="discoveryId" value={mapping.id}/><Typography.Text className="field-label">目标武器</Typography.Text><select name="weaponId" className="native-select" required defaultValue=""><option value="" disabled>请选择已有武器</option>{loaderData.weapons.map((weapon)=><option key={weapon.id} value={weapon.id}>{weapon.canonicalName}</option>)}</select><ActionButton className="modal-submit" kind="primary" htmlType="submit" block loading={fetcher.state!=="idle"}>保存别名并回填</ActionButton></fetcher.Form>:null}
    </FormModal>
    <FormModal title="批量导入赛季武器" open={importing} onClose={()=>setImporting(false)}>
      <Typography.Paragraph type="secondary">每行格式：标准名称 | 武器类型 | 加入赛季 | 别名1,别名2</Typography.Paragraph>
      <fetcher.Form method="post" onSubmit={()=>setImporting(false)}><input type="hidden" name="intent" value="import-weapons"/><Input.TextArea name="directory" rows={9} placeholder={"SCAR | 突击步枪 | S11 | SCAR-H\nK416 | 突击步枪 | S11 | K-416"}/><ActionButton className="modal-submit" kind="primary" htmlType="submit" block loading={fetcher.state!=="idle"}>导入并重解析历史简介</ActionButton></fetcher.Form>
    </FormModal>
    <FormModal
      title={editingWeapon ? `修改武器 · ${editingWeapon.canonicalName}` : "新增武器"}
      open={weaponEditorOpen}
      onClose={() => { if (weaponFetcher.state === "idle") setWeaponEditorOpen(false); }}


      mask={{ closable: weaponFetcher.state === "idle" }}
    >
      <weaponFetcher.Form method="post" key={editingWeapon?.id ?? "new"} onSubmit={() => setWeaponSubmitted(true)}>
        <input type="hidden" name="intent" value={editingWeapon ? "update-weapon" : "create-weapon"}/>
        {editingWeapon ? <input type="hidden" name="weaponId" value={editingWeapon.id}/> : null}
        <Typography.Text className="field-label">标准武器名</Typography.Text>
        <Input name="canonicalName" defaultValue={editingWeapon?.canonicalName ?? ""} placeholder="例如：PSG" autoFocus required maxLength={80}/>
        <Typography.Text className="field-label">别名</Typography.Text>
        <Select
          mode="tags"
          value={weaponAliases}
          onChange={setWeaponAliases}
          tokenSeparators={[",", "，"]}
          placeholder="输入别名后按回车，例如 PSG1"
          className="weapon-alias-select"
          options={weaponAliases.map((alias) => ({ label: alias, value: alias }))}
        />
        <input type="hidden" name="aliases" value={weaponAliases.join(",")}/>
        <Typography.Paragraph className="field-help" type="secondary">匹配时优先使用最长别名；修改标准名后旧名称会自动保留为别名。</Typography.Paragraph>
        <div className="weapon-form-grid">
          <div><Typography.Text className="field-label">武器类型</Typography.Text><Input name="weaponType" defaultValue={editingWeapon?.weaponType ?? ""} placeholder="例如：精确射手步枪"/></div>
          <div><Typography.Text className="field-label">加入赛季</Typography.Text><Input name="introducedSeason" defaultValue={editingWeapon?.introducedSeason ?? ""} placeholder="例如：S10"/></div>
        </div>
        <Typography.Text className="field-label">状态</Typography.Text>
        <select name="status" className="native-select" defaultValue={editingWeapon?.status ?? "confirmed"}>
          <option value="confirmed">已确认 · 参与自动归属</option>
          <option value="provisional">暂定 · 进入人工审核</option>
          <option value="retired">停用 · 不再自动匹配</option>
        </select>
        {weaponSubmitted && weaponFetcher.state === "idle" && weaponFetcher.data && !weaponFetcher.data.ok
          ? <FormError>{weaponFetcher.data.message}</FormError> : null}
        <ActionButton className="modal-submit" kind="primary" htmlType="submit" block loading={weaponFetcher.state!=="idle"}>
          {editingWeapon ? "保存修改并重新对账" : "新增并重新对账"}
        </ActionButton>
      </weaponFetcher.Form>
    </FormModal>
  </div>;
}
