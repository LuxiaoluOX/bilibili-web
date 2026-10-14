import {
  CheckCircleOutlined,
  CloudSyncOutlined,
  FileSearchOutlined,
  HistoryOutlined,
  LinkOutlined,
  RocketOutlined,
} from "@ant-design/icons";
import { Space, Tag, Typography } from "antd";
import { useState } from "react";
import type { ColumnsType } from "antd/es/table";
import { data, useFetcher } from "react-router";
import type { Route } from "./+types/season-sync";
import { ActionButton, ConfirmAction } from "../components/actions";
import { CountTag, StatusBadge, tablePagination, WorkbenchProTable } from "../components/data-display";
import { useFetcherToast } from "../components/feedback";
import { WorkbenchPanel } from "../components/layout";
import { OperationsHeader, OperationsSummary } from "../components/layout/operations";
import { requireRole } from "../lib/auth.server";
import {
  checkSeasonUpdates,
  listSeasonSyncDashboard,
  publishSeasonCandidate,
  rejectSeasonCandidate,
  seasonSyncSource,
} from "../lib/season-sync.server";

export function meta() { return [{ title: "赛季同步 · 三角洲行动数据中台" }]; }

export async function loader({ request }: Route.LoaderArgs) {
  await requireRole(request, ["admin"]);
  return { ...(await listSeasonSyncDashboard()), source: seasonSyncSource };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireRole(request, ["admin"]);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  try {
    if (intent === "check-now") {
      const result = await checkSeasonUpdates("manual", user.id);
      return data({ ok: true, message: result.changesFound ? `发现 ${result.changesFound} 项待确认变更` : `已检查 ${result.sourcesChecked} 条官方公告，暂无新变更`, intent });
    }
    if (intent === "publish") {
      const result = await publishSeasonCandidate(String(form.get("candidateId") ?? ""), user.id);
      return data({ ok: true, message: `${result.seasonCode} 已发布，并重解析 ${result.reparsedSources} 条来源数据`, intent });
    }
    if (intent === "reject") {
      await rejectSeasonCandidate(String(form.get("candidateId") ?? ""), user.id);
      return data({ ok: true, message: "该变更已标记为不采用", intent });
    }
    return data({ ok: false, message: "未知操作", intent }, { status: 400 });
  } catch (error) {
    return data({ ok: false, message: error instanceof Error ? error.message : "操作失败", intent }, { status: 400 });
  }
}

type Dashboard = Awaited<ReturnType<typeof listSeasonSyncDashboard>>;
type Candidate = Dashboard["candidates"][number];
type Source = Dashboard["sources"][number];
type Run = Dashboard["runs"][number];

function dateTime(value: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) : "—";
}

const candidateStatus = {
  pending: { label: "待确认", status: "warning" as const },
  published: { label: "已发布", status: "success" as const },
  rejected: { label: "不采用", status: "neutral" as const },
  failed: { label: "发布失败", status: "danger" as const },
};

const runStatus = {
  running: { label: "进行中", status: "info" as const },
  succeeded: { label: "发现变更", status: "success" as const },
  no_changes: { label: "无变更", status: "neutral" as const },
  failed: { label: "失败", status: "danger" as const },
};

export default function SeasonSync({ loaderData }: Route.ComponentProps) {
  const fetcher = useFetcher<typeof action>();
  const [section, setSection] = useState("pending");
  useFetcherToast(fetcher, { loading: "正在处理赛季同步…" });
  const busyIntent = fetcher.formData ? String(fetcher.formData.get("intent")) : null;
  const busyId = fetcher.formData ? String(fetcher.formData.get("candidateId") ?? "") : null;
  const pending = loaderData.candidates.filter((candidate) => candidate.status === "pending" || candidate.status === "failed");
  const published = loaderData.candidates.filter((candidate) => candidate.status === "published");
  const lastRun = loaderData.runs[0] ?? null;

  const candidateColumns: ColumnsType<Candidate> = [
    { title: "赛季", dataIndex: "seasonCode", width: 120, fixed: "left", render: (_, row) => <Space size={8}><Typography.Text strong>{row.seasonCode}</Typography.Text><span>{row.seasonName}</span></Space> },
    { title: "开始时间", dataIndex: "startsAt", width: 180, align: "center", render: (value) => dateTime(value) },
    { title: "识别武器", dataIndex: "weapons", width: 320, render: (weapons: Candidate["weapons"]) => weapons.length ? <Space size={[6, 6]} wrap>{weapons.map((weapon) => <Tag key={weapon.canonicalName}>{weapon.canonicalName}<small>{weapon.weaponType ? ` · ${weapon.weaponType}` : ""}</small></Tag>)}</Space> : <Typography.Text type="secondary">无新增武器</Typography.Text> },
    { title: "来源", dataIndex: "sourceTitle", width: 280, ellipsis: true, render: (value, row) => <a href={row.sourceUrl} target="_blank" rel="noreferrer"><LinkOutlined /> {value}</a> },
    { title: "状态", dataIndex: "status", width: 110, align: "center", render: (value: Candidate["status"]) => <StatusBadge {...candidateStatus[value]} /> },
    { title: "操作", key: "actions", width: 190, fixed: "right", align: "center", render: (_, row) => <Space size={4}>
      <ActionButton kind="primary" scale="row" icon={<RocketOutlined />} loading={busyIntent === "publish" && busyId === row.id} disabled={fetcher.state !== "idle" || row.status === "published" || row.status === "rejected"} onClick={() => fetcher.submit({ intent: "publish", candidateId: row.id }, { method: "post" })}>确认发布</ActionButton>
      <ConfirmAction title="不采用该变更？" description="记录会保留在历史中，官方源证据不会删除。" confirmText="不采用" disabled={fetcher.state !== "idle"} confirmLoading={busyIntent === "reject" && busyId === row.id} onConfirm={() => fetcher.submit({ intent: "reject", candidateId: row.id }, { method: "post" })}>忽略</ConfirmAction>
    </Space> },
  ];

  const sourceColumns: ColumnsType<Source> = [
    { title: "官方来源", dataIndex: "provider", width: 120, render: () => <Tag color="blue">Steam 官方</Tag> },
    { title: "公告标题", dataIndex: "title", width: 420, ellipsis: true, render: (value, row) => <a href={row.sourceUrl} target="_blank" rel="noreferrer"><LinkOutlined /> {value}</a> },
    { title: "公告发布时间", dataIndex: "publishedAt", width: 190, align: "center", render: dateTime },
    { title: "最近核验", dataIndex: "lastSeenAt", width: 190, align: "center", render: dateTime },
    { title: "证据指纹", dataIndex: "contentHash", width: 170, render: (value: string) => <Typography.Text code>{value.slice(0, 12)}</Typography.Text> },
  ];

  const runColumns: ColumnsType<Run> = [
    { title: "任务", dataIndex: "kind", width: 110, render: (value) => value === "check" ? "官方源检查" : "发布同步" },
    { title: "触发", dataIndex: "trigger", width: 100, align: "center", render: (value) => value === "schedule" ? "后台自动" : "管理员" },
    { title: "状态", dataIndex: "status", width: 120, align: "center", render: (value: Run["status"]) => <StatusBadge {...runStatus[value as keyof typeof runStatus]} /> },
    { title: "检查公告", dataIndex: "sourcesChecked", width: 100, align: "right" },
    { title: "发现变更", dataIndex: "changesFound", width: 100, align: "right" },
    { title: "执行人", dataIndex: "actorName", width: 130, render: (value, row) => value ?? (row.trigger === "schedule" ? "系统 Worker" : "—") },
    { title: "开始时间", dataIndex: "startedAt", width: 190, align: "center", render: dateTime },
    { title: "结果", dataIndex: "errorMessage", width: 300, ellipsis: true, render: (value, row) => value ? <Typography.Text type="danger">{value}</Typography.Text> : row.status === "no_changes" ? "当前目录已是最新" : "已完成" },
  ];

  return <div className="page redesigned-settings-page operations-page season-sync-page">
    <OperationsHeader title="赛季同步" description="核对官方变更，人工确认后发布。" />
    <OperationsSummary icon={<CloudSyncOutlined />} title={<>当前赛季 {loaderData.currentSeason?.code ?? "—"} · {loaderData.currentSeason?.name ?? "尚未配置"}</>} status={<StatusBadge status={lastRun ? runStatus[lastRun.status as keyof typeof runStatus]?.status ?? "neutral" : "neutral"} label={lastRun ? `上次：${runStatus[lastRun.status as keyof typeof runStatus]?.label ?? lastRun.status}` : "尚未检查"} />} actions={<ActionButton kind="primary" icon={<CloudSyncOutlined />} loading={busyIntent === "check-now"} disabled={fetcher.state !== "idle"} onClick={() => fetcher.submit({ intent: "check-now" }, { method: "post" })}>立即检查</ActionButton>}>
      <span>{loaderData.source.name}</span><span>每 {loaderData.source.intervalHours} 小时自动检查</span><span>最近执行：{lastRun ? dateTime(lastRun.startedAt) : "尚未运行"}</span>
    </OperationsSummary>
    <div className="operations-inline-stats"><span>待确认 <strong>{pending.length}</strong></span><span>来源证据 <strong>{loaderData.sources.length}</strong></span><span>已发布 <strong>{published.length}</strong></span><span>历史任务 <strong>{loaderData.runs.length}</strong></span></div>
    <p className="operations-policy-note">检查只生成待确认变更，不自动发布或覆盖现有目录。</p>
    <nav className="operations-tabs" aria-label="赛季同步分区">{[
      { key: "pending", label: "待确认变更", count: pending.length, icon: <FileSearchOutlined /> },
      { key: "sources", label: "来源证据", count: loaderData.sources.length, icon: <LinkOutlined /> },
      { key: "history", label: "历史记录", count: loaderData.runs.length, icon: <HistoryOutlined /> },
    ].map((item) => <button key={item.key} type="button" aria-pressed={section === item.key} aria-controls={`season-${item.key}`} className={section === item.key ? "is-active" : ""} onClick={() => setSection(item.key)}>{item.icon}{item.label}<span>{item.count}</span></button>)}</nav>
    <section id="season-pending" hidden={section !== "pending"} className="operations-tab-panel" aria-label="待确认变更">
    <WorkbenchPanel className="season-sync-section" title={<Space><FileSearchOutlined />待确认变更</Space>} description="核对赛季名称、开始时间、新武器与原始公告后再确认。" extra={<CountTag tone={pending.length ? "amber" : "green"}>{pending.length} 项待处理</CountTag>}>
      {pending.length ? <WorkbenchProTable preferenceKey="season-sync-pending" rowKey="id" columns={candidateColumns} dataSource={pending} scroll={{ x: 1300 }} pagination={false} /> : <div className="season-sync-empty"><CheckCircleOutlined /><span>没有待确认变更</span><small>后台仍会按计划继续检查官方公告</small></div>}
    </WorkbenchPanel>

    <details className="operations-details"><summary>发布流程与影响范围</summary><p>核对公告 → 确认发布 → 写入赛季与武器目录 → 重解析该赛季以来的来源。不会自动覆盖已有赛季日期，也不会自动删除或合并武器。</p></details>
    </section>
    <section id="season-sources" hidden={section !== "sources"} className="operations-tab-panel" aria-label="来源证据">
    <WorkbenchPanel className="season-sync-section" title={<Space><LinkOutlined />来源证据</Space>} description="查看官方公告、发布时间与内容指纹。">
      <WorkbenchProTable preferenceKey="season-sync-sources" rowKey="id" columns={sourceColumns} dataSource={loaderData.sources} scroll={{ x: 1090 }} pagination={tablePagination(8, "条证据")} />
    </WorkbenchPanel>
    </section>
    <section id="season-history" hidden={section !== "history"} className="operations-tab-panel" aria-label="历史记录">
    <WorkbenchPanel className="season-sync-section" title={<Space><HistoryOutlined />历史记录</Space>} description="记录手动和后台检查、发布结果与失败原因。">
      <WorkbenchProTable preferenceKey="season-sync-history" rowKey="id" columns={runColumns} dataSource={loaderData.runs} scroll={{ x: 1150 }} pagination={tablePagination(12, "条任务")} />
    </WorkbenchPanel>
    </section>
  </div>;
}
