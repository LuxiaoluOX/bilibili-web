import { ClockCircleOutlined, PauseCircleOutlined, PlayCircleOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { Alert, Avatar, Empty, Input, Radio, Space, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { data, Form, useFetcher } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/creators";
import { ActionButton, ActionGroup } from "../components/actions";
import { CountTag, StatusBadge, tablePagination, WorkbenchProTable } from "../components/data-display";
import { useFetcherToast } from "../components/feedback";
import { ActionDrawer, DataToolbar, FormModal } from "../components/forms";
import { MetricGrid, PageHeader } from "../components/layout";
import { audit } from "../lib/audit.server";
import { requireRole, requireUser } from "../lib/auth.server";
import { getCreator } from "../lib/bilibili.server";
import { DEFAULT_CRON, nextCronRun, validateCron } from "../lib/cron.server";
import { getCreatorIntelligence } from "../lib/creator-intelligence.server";
import { query } from "../lib/db.server";
import { canOperate } from "../lib/domain";
import { cancelQueuedCrawls, CreatorUnavailableError, enqueueCrawl } from "../lib/queue.server";
import { listCreators } from "../lib/repository.server";

export function meta() { return [{ title: "创作者情报 · 三角洲行动数据中台" }]; }

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const url = new URL(request.url);
  const search = url.searchParams.get("q") ?? "";
  const [settings, creators, intelligence] = await Promise.all([
    query<{ cron_expression: string }>("select coalesce(value->>'cronExpression', $1) cron_expression from system_settings where key = 'global_schedule'", [DEFAULT_CRON]),
    listCreators(search),
    getCreatorIntelligence(search),
  ]);
  const intelligenceById = new Map(intelligence.items.map((item) => [item.id, item]));
  return {
    user,
    creators: creators.map((creator) => ({ ...creator, ...intelligenceById.get(creator.id)! })),
    globalCron: settings.rows[0]?.cron_expression ?? DEFAULT_CRON,
    intelligence: { periodDays: intelligence.periodDays, summary: intelligence.summary },
  };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireRole(request, ["admin", "operator"]);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  if (intent === "add") {
    const parsed = z.string().regex(/^\d{4,20}$/, "请输入有效的 B 站 UID").safeParse(String(form.get("mid") ?? "").trim());
    if (!parsed.success) return data({ ok: false, message: parsed.error.issues[0].message }, { status: 400 });
    try {
      const profile = await getCreator(parsed.data);
      const inserted = await query<{ id: string }>(
        `insert into creators (bilibili_mid, name, avatar_url, next_run_at)
         values ($1, $2, $3, now())
         on conflict (bilibili_mid) do update set name = excluded.name, avatar_url = excluded.avatar_url,
           enabled = true, deleted_at = null, updated_at = now() returning id`,
        [parsed.data, profile.name, profile.face ?? null],
      );
      await enqueueCrawl(inserted.rows[0].id, "backfill", user.id);
      await audit(user.id, "creator.added", "creator", inserted.rows[0].id, { mid: parsed.data });
      return data({ ok: true, message: `已添加 ${profile.name}，首次回溯任务已排队` });
    } catch (error) {
      return data({ ok: false, message: error instanceof Error ? error.message : "无法验证该博主" }, { status: 400 });
    }
  }
  const creatorId = String(form.get("creatorId") ?? "");
  if (intent === "crawl") {
    try {
      const result = await enqueueCrawl(creatorId, "manual", user.id);
      return data({ ok: true, message: result.created ? "抓取任务已提交" : "该博主已有进行中的任务" });
    } catch (error) {
      return data(
        { ok: false, message: error instanceof Error ? `无法提交抓取任务：${error.message}` : "无法提交抓取任务" },
        { status: error instanceof CreatorUnavailableError ? 400 : 500 },
      );
    }
  }
  if (intent === "toggle") {
    const enabled = String(form.get("enabled")) === "true";
    await query("update creators set enabled = $2, updated_at = now() where id = $1", [creatorId, enabled]);
    if (!enabled) await cancelQueuedCrawls(creatorId, user.id);
    await audit(user.id, enabled ? "creator.enabled" : "creator.disabled", "creator", creatorId);
    return data({ ok: true, message: enabled ? "已启用博主" : "已停用博主并取消排队任务" });
  }
  if (intent === "schedule") {
    const mode = String(form.get("mode")) === "override" ? "override" : "inherit";
    const cron = mode === "override" ? String(form.get("cron") ?? "").trim() : null;
    if (cron && !validateCron(cron).valid) return data({ ok: false, message: "Cron 表达式无效" }, { status: 400 });
    const global = String(form.get("globalCron") ?? DEFAULT_CRON);
    await query("update creators set schedule_mode = $2, cron_expression = $3, next_run_at = $4, updated_at = now() where id = $1", [creatorId, mode, cron, nextCronRun(cron ?? global)]);
    await audit(user.id, "creator.schedule.updated", "creator", creatorId, { mode, cron });
    return data({ ok: true, message: "抓取计划已保存" });
  }
  return data({ ok: false, message: "未知操作" }, { status: 400 });
}

type Creator = Awaited<ReturnType<typeof loader>>["creators"][number];

const valueSignals = {
  strong: { label: "高价值", tone: "green" as const },
  steady: { label: "稳定", tone: "cyan" as const },
  review: { label: "建议复核", tone: "amber" as const },
  insufficient: { label: "样本不足", tone: "default" as const },
};

function rateLabel(value: number | null) {
  return value === null ? "暂无数据" : `${value}%`;
}

function dateLabel(value: string | null) {
  return value ? new Date(value).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" }) : "暂无发布记录";
}

export default function Creators({ loaderData }: Route.ComponentProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Creator | null>(null);
  const fetcher = useFetcher<typeof action>();
  useFetcherToast(fetcher, { loading: "正在更新创作者…" });
  const canEdit = canOperate(loaderData.user.role);
  const activeCreatorId = fetcher.formData?.get("creatorId");
  const columns: ColumnsType<Creator> = [
    { title: "博主信息", dataIndex: "name", fixed: "left", width: 250, align: "left", render: (_, row) => <Space><Avatar src={row.avatarUrl}>{row.name.slice(0,1)}</Avatar><div><Typography.Text strong>{row.name}</Typography.Text><br/><Typography.Text type="secondary">UID {row.bilibiliMid}</Typography.Text></div></Space> },
    { title: "价值信号", dataIndex: "valueSignal", width: 110, align: "center", sorter: (a, b) => ({ strong: 3, steady: 2, insufficient: 1, review: 0 }[a.valueSignal] - { strong: 3, steady: 2, insufficient: 1, review: 0 }[b.valueSignal]), render: (value: Creator["valueSignal"]) => <CountTag tone={valueSignals[value].tone}>{valueSignals[value].label}</CountTag> },
    { title: "更新频率", dataIndex: "updateFrequency", width: 120, align: "right", sorter: (a, b) => a.updateFrequency - b.updateFrequency, render: (value: number, row) => <span>{value} 次/周<br/><Typography.Text type="secondary">近 {row.recentVideos} 条视频</Typography.Text></span> },
    { title: "有效码产出率", dataIndex: "effectiveCodeRate", width: 140, align: "right", sorter: (a, b) => (a.effectiveCodeRate ?? -1) - (b.effectiveCodeRate ?? -1), render: (value: number | null, row) => <span>{rateLabel(value)}<br/><Typography.Text type="secondary">接受 {row.acceptedCandidates} / 已判定 {row.reviewedCandidates}</Typography.Text></span> },
    { title: "重复率", dataIndex: "duplicateRate", width: 120, align: "right", sorter: (a, b) => (a.duplicateRate ?? -1) - (b.duplicateRate ?? -1), render: (value: number | null, row) => <span>{rateLabel(value)}<br/><Typography.Text type="secondary">{row.distinctCodes} 个去重码</Typography.Text></span> },
    { title: "有效码", dataIndex: "acceptedCodes", width: 100, align: "right", sorter: (a, b) => a.acceptedCodes - b.acceptedCodes, render: (value: number, row) => <span>{value}<br/><Typography.Text type="secondary">{row.buildCount} 个方案</Typography.Text></span> },
    { title: "最后活跃", dataIndex: "lastActiveAt", width: 145, align: "center", sorter: (a, b) => (a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0) - (b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0), render: (value: string | null, row) => <span>{dateLabel(value)}{row.daysSinceActive !== null ? <><br/><Typography.Text type="secondary">{row.daysSinceActive} 天前</Typography.Text></> : null}</span> },
    { title: "状态", dataIndex: "enabled", width: 100, align: "center", render: (enabled) => <StatusBadge status={enabled ? "success" : "neutral"} label={enabled ? "启用" : "停用"} /> },
    { title: "计划来源", dataIndex: "scheduleMode", width: 120, align: "center", render: (mode) => <CountTag tone={mode === "inherit" ? "default" : "cyan"}>{mode === "inherit" ? "继承全局" : "自定义"}</CountTag> },
    { title: "Cron 表达式", width: 150, align: "center", render: (_, row) => <Typography.Text code>{row.cronExpression ?? loaderData.globalCron}</Typography.Text> },
    { title: "上次抓取", dataIndex: "lastCrawledAt", width: 170, align: "center", render: (value) => value ? new Date(value).toLocaleString("zh-CN") : "尚未抓取" },
    { title: "下次运行", dataIndex: "nextRunAt", width: 170, align: "center", render: (value) => value ? new Date(value).toLocaleString("zh-CN") : "—" },
    { title: "操作", fixed: "right", width: 260, align: "center", render: (_, row) => canEdit ? <ActionGroup compact><fetcher.Form method="post"><input type="hidden" name="creatorId" value={row.id}/><ActionButton kind="link" scale="row" htmlType="submit" name="intent" value="crawl" icon={<PlayCircleOutlined />} disabled={!row.enabled} loading={activeCreatorId === row.id && fetcher.formData?.get("intent") === "crawl"}>立即抓取</ActionButton></fetcher.Form><ActionButton kind="link" scale="row" icon={<ClockCircleOutlined />} onClick={() => setEditing(row)}>计划</ActionButton><fetcher.Form method="post"><input type="hidden" name="creatorId" value={row.id}/><input type="hidden" name="enabled" value={String(!row.enabled)}/><ActionButton kind="tertiary" scale="row" htmlType="submit" name="intent" value="toggle" icon={row.enabled ? <PauseCircleOutlined /> : <PlayCircleOutlined />} loading={activeCreatorId === row.id && fetcher.formData?.get("intent") === "toggle"}>{row.enabled ? "停用" : "启用"}</ActionButton></fetcher.Form></ActionGroup> : "只读" },
  ];
  return <div className="page creator-intelligence-page"><PageHeader eyebrow="CREATOR INTELLIGENCE" title="创作者情报" description="评估白名单创作者的活跃度与码质量。" actions={canEdit ? <ActionButton kind="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>添加博主</ActionButton> : null} />
    <MetricGrid items={[
      { key: "active", label: "近 30 天活跃", value: `${loaderData.intelligence.summary.activeCreators} / ${loaderData.creators.length}`, hint: "按视频发布时间", status: loaderData.intelligence.summary.activeCreators ? "success" : "warning" },
      { key: "frequency", label: "平均更新频率", value: `${loaderData.intelligence.summary.averageWeeklyFrequency} 次/周`, hint: `近 ${loaderData.intelligence.periodDays} 天`, status: "info" },
      { key: "effective", label: "有效码产出率", value: rateLabel(loaderData.intelligence.summary.effectiveCodeRate), hint: "接受 / 已判定", status: loaderData.intelligence.summary.effectiveCodeRate === null ? "neutral" : loaderData.intelligence.summary.effectiveCodeRate >= 50 ? "success" : "warning" },
      { key: "duplicate", label: "重复率", value: rateLabel(loaderData.intelligence.summary.duplicateRate), hint: "重复 / 全部候选", status: loaderData.intelligence.summary.duplicateRate === null ? "neutral" : loaderData.intelligence.summary.duplicateRate < 40 ? "success" : "warning" },
    ]} />
    <Alert className="creator-definition-alert" type="info" showIcon title="口径" description={`近 ${loaderData.intelligence.periodDays} 天；有效率不含待审核；重复率按同一创作者的标准化代码计算。价值信号仅供参考。`} />
    <DataToolbar main={<Form method="get" className="data-toolbar-search"><Input name="q" prefix={<SearchOutlined />} placeholder="搜索昵称或 UID" allowClear/><ActionButton kind="secondary" htmlType="submit">搜索</ActionButton></Form>} aside={<Typography.Text type="secondary">共 {loaderData.creators.length} 位白名单博主</Typography.Text>} />
    <section className="table-section"><WorkbenchProTable preferenceKey="creators-intelligence" rowKey="id" columns={columns} dataSource={loaderData.creators} scroll={{x:2100}} pagination={tablePagination(12, "位博主")} locale={{emptyText:<Empty description="尚未添加白名单博主"/>}} /></section>
    <FormModal title="添加白名单博主" open={addOpen} onClose={() => setAddOpen(false)}><fetcher.Form method="post" onSubmit={() => setAddOpen(false)}><Typography.Paragraph type="secondary">输入 B 站 UID。系统会验证博主并自动创建最近 30 条视频的回溯任务。</Typography.Paragraph><Input name="mid" placeholder="例如：223344556" size="large" autoFocus/><ActionButton className="modal-submit" kind="primary" htmlType="submit" name="intent" value="add" block>验证并添加</ActionButton></fetcher.Form></FormModal>
    <ActionDrawer title="编辑抓取计划" open={Boolean(editing)} onClose={() => setEditing(null)} width={440}>{editing ? <fetcher.Form method="post" onSubmit={() => setEditing(null)}><input type="hidden" name="creatorId" value={editing.id}/><input type="hidden" name="globalCron" value={loaderData.globalCron}/><div className="drawer-creator"><Avatar src={editing.avatarUrl}>{editing.name.slice(0,1)}</Avatar><div><strong>{editing.name}</strong><span>UID {editing.bilibiliMid}</span></div></div><Typography.Title level={5}>计划设置</Typography.Title><Radio.Group name="mode" defaultValue={editing.scheduleMode}><Space orientation="vertical"><Radio value="inherit">继承全局计划 <Typography.Text type="secondary">({loaderData.globalCron})</Typography.Text></Radio><Radio value="override">使用自定义计划</Radio></Space></Radio.Group><Typography.Text className="field-label">Cron 表达式</Typography.Text><Input name="cron" defaultValue={editing.cronExpression ?? loaderData.globalCron}/><Typography.Paragraph type="secondary">5 位表达式：分钟 小时 日 月 星期；时区固定为 Asia/Shanghai。</Typography.Paragraph><ActionButton kind="primary" htmlType="submit" name="intent" value="schedule" block>保存计划</ActionButton></fetcher.Form> : null}</ActionDrawer>
  </div>;
}
