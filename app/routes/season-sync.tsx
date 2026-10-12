import {
  CheckCircleOutlined,
  CloudSyncOutlined,
  FileSearchOutlined,
  HistoryOutlined,
  LinkOutlined,
  RocketOutlined,
} from "@ant-design/icons";
import { Alert, Descriptions, Space, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { data, useFetcher } from "react-router";
import type { Route } from "./+types/season-sync";
import { ActionButton, ConfirmAction } from "../components/actions";
import { CountTag, StatusBadge, tablePagination, WorkbenchProTable } from "../components/data-display";
import { useFetcherToast } from "../components/feedback";
import { MetricGrid, PageHeader, WorkbenchPanel } from "../components/layout";
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

  return <div className="page season-sync-page">
    <PageHeader eyebrow="SEASON OPERATIONS" title="赛季同步" description="定期核验官方赛季公告，将新赛季与新武器整理为待确认变更；只有管理员确认后才会发布到生产目录。" actions={<ActionButton kind="primary" icon={<CloudSyncOutlined />} loading={busyIntent === "check-now"} disabled={fetcher.state !== "idle"} onClick={() => fetcher.submit({ intent: "check-now" }, { method: "post" })}>立即检查</ActionButton>} />
    <MetricGrid items={[
      { key: "season", label: "当前赛季", value: loaderData.currentSeason?.code ?? "—", hint: loaderData.currentSeason?.name ?? "尚未配置", status: "success" },
      { key: "pending", label: "待确认变更", value: pending.length, hint: pending.length ? "检查证据后确认发布" : "目录已对齐", status: pending.length ? "warning" : "success" },
      { key: "sources", label: "来源证据", value: loaderData.sources.length, hint: "已留存官方公告指纹" },
      { key: "published", label: "已发布同步", value: published.length, hint: "通过本页面完成" },
      { key: "interval", label: "自动检查", value: `${loaderData.source.intervalHours}h`, hint: "后台只检查，不自动发布", status: "info" },
      { key: "runs", label: "历史任务", value: loaderData.runs.length, hint: lastRun ? dateTime(lastRun.startedAt) : "尚未运行" },
    ]} />

    <WorkbenchPanel className="season-sync-section" title={<Space><CloudSyncOutlined />立即检查</Space>} description="读取官方公告并生成差异，不直接修改赛季和武器数据。" extra={<StatusBadge status={lastRun?.status === "failed" ? "danger" : "success"} label={lastRun ? `上次：${runStatus[lastRun.status as keyof typeof runStatus]?.label ?? lastRun.status}` : "等待首次检查"} />}>
      <div className="season-sync-section-body season-check-body">
        <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 4 }} items={[
          { key: "source", label: "数据源", children: loaderData.source.name },
          { key: "policy", label: "发布策略", children: "人工确认后发布" },
          { key: "schedule", label: "后台频率", children: `每 ${loaderData.source.intervalHours} 小时检查` },
          { key: "last", label: "最近检查", children: lastRun ? dateTime(lastRun.startedAt) : "—" },
        ]} />
        <Alert type="info" showIcon message="安全边界" description="检查任务只保存公告、证据指纹和候选差异；不会自动覆盖已有赛季日期，也不会自动删除或合并武器。" />
      </div>
    </WorkbenchPanel>

    <WorkbenchPanel className="season-sync-section" title={<Space><FileSearchOutlined />待确认变更</Space>} description="核对赛季名称、开始时间、新武器与原始公告后再确认。" extra={<CountTag tone={pending.length ? "amber" : "green"}>{pending.length} 项待处理</CountTag>}>
      {pending.length ? <WorkbenchProTable preferenceKey="season-sync-pending" rowKey="id" columns={candidateColumns} dataSource={pending} scroll={{ x: 1300 }} pagination={false} /> : <div className="season-sync-empty"><CheckCircleOutlined /><span>没有待确认变更</span><small>后台仍会按计划继续检查官方公告</small></div>}
    </WorkbenchPanel>

    <WorkbenchPanel className="season-sync-section" title={<Space><LinkOutlined />来源证据</Space>} description="保留官方公告链接、发布时间与内容指纹，便于确认和追溯。">
      <WorkbenchProTable preferenceKey="season-sync-sources" rowKey="id" columns={sourceColumns} dataSource={loaderData.sources} scroll={{ x: 1090 }} pagination={tablePagination(8, "条证据")} />
    </WorkbenchPanel>

    <WorkbenchPanel className="season-sync-section" title={<Space><RocketOutlined />发布同步</Space>} description="确认后以事务写入赛季和武器目录，并触发该赛季以来的来源重解析。" extra={<StatusBadge status={pending.length ? "warning" : "success"} label={pending.length ? "等待管理员确认" : "生产目录已同步"} />}>
      <div className="season-sync-section-body season-publish-flow">
        <div><b>1. 差异校验</b><span>比对现有赛季编号、武器标准名和别名</span></div>
        <div><b>2. 人工确认</b><span>检查来源证据后点击“确认发布”</span></div>
        <div><b>3. 原子发布</b><span>同一事务写入赛季、武器与审计记录</span></div>
        <div><b>4. 历史对账</b><span>重解析新赛季以来捕获的视频简介</span></div>
      </div>
    </WorkbenchPanel>

    <WorkbenchPanel className="season-sync-section" title={<Space><HistoryOutlined />历史记录</Space>} description="记录手动和后台检查、发布结果与失败原因。">
      <WorkbenchProTable preferenceKey="season-sync-history" rowKey="id" columns={runColumns} dataSource={loaderData.runs} scroll={{ x: 1150 }} pagination={tablePagination(12, "条任务")} />
    </WorkbenchPanel>
  </div>;
}
