import {
  CheckCircleFilled,
  ExclamationCircleFilled,
  ImportOutlined,
  PlayCircleFilled,
  RightOutlined,
  SafetyCertificateOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import { Alert, Badge, Empty, Input, Select, Space, Typography } from "antd";
import { useState } from "react";
import { data, Link, useFetcher } from "react-router";
import type { Route } from "./+types/dashboard";
import { ActionButton } from "../components/actions/action-button";
import { ActionGroup } from "../components/actions/action-group";
import { CodeValue, CountTag } from "../components/data-display/cells";
import { StatusBadge } from "../components/data-display/status";
import { TrendChart } from "../components/data-display/trend-chart";
import { useFetcherToast } from "../components/feedback/fetcher-toast";
import { FormModal } from "../components/forms/overlays";
import { PageHeader } from "../components/layout/page-header";
import { MetricGrid, TaskInbox, WorkbenchPanel } from "../components/layout/panels";
import { audit } from "../lib/audit.server";
import { requireRole, requireUser } from "../lib/auth.server";
import { acceptCandidate, importManualText } from "../lib/crawler.server";
import { canOperate } from "../lib/domain";
import { enqueueCrawl } from "../lib/queue.server";
import { CandidateReviewConflictError, rejectPendingCandidates } from "../lib/review.server";
import { getDashboard, listCreators, listDashboardCreatorOptions, listRecentBuilds } from "../lib/repository.server";
import { getWorkerReliability } from "../lib/worker-reliability.server";
import { listPendingWeaponDiscoveries } from "../lib/weapon-catalog.server";

export function meta() { return [{ title: "抓取作战台 · 三角洲行动数据情报工作台" }]; }

export async function loader({ request }: Route.LoaderArgs) {
  const [user, dashboard, creators, builds, discoveries, worker] = await Promise.all([
    requireUser(request), getDashboard(), listDashboardCreatorOptions(), listRecentBuilds(8), listPendingWeaponDiscoveries(3), getWorkerReliability(),
  ]);
  return { user, dashboard, creators, builds, discoveries, worker };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireRole(request, ["admin", "operator"]);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  if (intent === "crawl-all") {
    try {
      const creators = await listCreators();
      const enabled = creators.filter((creator) => creator.enabled);
      const results = await Promise.all(enabled.map((creator) => enqueueCrawl(creator.id, "manual", user.id)));
      const created = results.filter((result) => result.created).length;
      return data({ ok: true, intent, message: created ? `已提交 ${created} 个抓取任务` : "所有博主已有进行中的任务" });
    } catch (error) {
      return data({ ok: false, intent, message: error instanceof Error ? `无法提交抓取任务：${error.message}` : "无法提交抓取任务" }, { status: 500 });
    }
  }
  if (intent === "manual-import") {
    const creatorId = String(form.get("creatorId") ?? "");
    const rawText = String(form.get("rawText") ?? "").trim();
    const sourceUrl = String(form.get("sourceUrl") ?? "").trim();
    if (!creatorId) return data({ ok: false, intent, message: "请选择白名单博主" }, { status: 400 });
    if (rawText.length < 8) return data({ ok: false, intent, message: "请输入包含改枪码的简介文本" }, { status: 400 });
    if (rawText.length > 50_000) return data({ ok: false, intent, message: "单次导入文本不能超过 50000 字符" }, { status: 400 });
    if (sourceUrl && !/^https:\/\/(?:www\.)?bilibili\.com\//i.test(sourceUrl)) return data({ ok: false, intent, message: "来源链接必须是 B 站 HTTPS 地址" }, { status: 400 });
    try {
      const result = await importManualText({ creatorId, rawText, sourceUrl: sourceUrl || undefined });
      await audit(user.id, "source.manual_imported", "creator", creatorId, { candidatesFound: result.candidatesFound });
      return data({ ok: true, intent, message: result.candidatesFound ? `导入完成，识别到 ${result.candidatesFound} 个候选码` : "文本已保存，暂未识别到改枪码" });
    } catch (error) {
      return data({ ok: false, intent, message: error instanceof Error ? error.message : "手动导入失败" }, { status: 400 });
    }
  }
  const candidateId = String(form.get("candidateId") ?? "");
  if (intent === "accept") {
    try {
      await acceptCandidate(candidateId, user.id);
      await audit(user.id, "candidate.accepted", "candidate", candidateId);
      return data({ ok: true, intent, message: "已通过并写入版本库" });
    } catch (error) {
      if (error instanceof CandidateReviewConflictError) return data({ ok: false, intent, message: error.message }, { status: 409 });
      throw error;
    }
  }
  if (intent === "reject") {
    try {
      await rejectPendingCandidates([candidateId], user.id);
      await audit(user.id, "candidate.rejected", "candidate", candidateId);
      return data({ ok: true, intent, message: "已拒绝候选项" });
    } catch (error) {
      if (error instanceof CandidateReviewConflictError) return data({ ok: false, intent, message: error.message }, { status: 409 });
      throw error;
    }
  }
  return data({ ok: false, intent, message: "未知操作" }, { status: 400 });
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { dashboard, user, builds, discoveries, worker } = loaderData;
  const runs = dashboard.runs;
  const crawlFetcher = useFetcher<typeof action>();
  const importFetcher = useFetcher<typeof action>();
  useFetcherToast(crawlFetcher, { loading: "正在提交抓取任务…" });
  useFetcherToast(importFetcher, { loading: "正在识别简介…" });
  const [importOpen, setImportOpen] = useState(false);
  const [importCreatorId, setImportCreatorId] = useState<string>();
  const pendingCandidates = dashboard.candidates.filter((item) => item.status === "pending");
  const pendingDiscoveries = discoveries;
  const trendData = dashboard.trend;

  const taskItems = [
    ...pendingDiscoveries.slice(0, 3).map((item) => ({
      id: `weapon-${item.id}`,
      title: `确认新武器：${item.suggestedName}`,
      description: <>已在简介中出现 {item.occurrences} 次，确认或映射后将自动回填历史数据。</>,
      meta: item.videoTitle ?? "来自已保存的视频简介",
      status: "warning" as const,
      action: <ActionButton kind="secondary" scale="row" to="/builds">前往确认 <RightOutlined /></ActionButton>,
    })),
    ...pendingCandidates.slice(0, 4).map((item) => ({
      id: `candidate-${item.id}`,
      title: item.weapon_name ? `${item.weapon_name} · ${item.build_name ?? "未命名方案"}` : `待归属：${item.suggested_weapon ?? "未知武器"}`,
      description: <Space wrap size={8}><CodeValue value={item.normalized_code} /><CountTag tone="amber">码可信度 {item.codeConfidence.toFixed(2)}</CountTag></Space>,
      meta: `${item.creator_name} · ${item.video_title}`,
      status: item.weapon_name ? "info" as const : "warning" as const,
      action: <ActionButton kind="secondary" scale="row" to={item.weapon_name ? "/reviews" : "/builds"}>{item.weapon_name ? "审核" : "确认武器"} <RightOutlined /></ActionButton>,
    })),
  ];

  const metrics = [
    { key: "creators", label: "启用博主", value: dashboard.stats.creators, hint: "仅扫描白名单账号", status: "info" as const },
    { key: "videos", label: "今日扫描视频", value: dashboard.stats.videos, hint: dashboard.stats.activeRuns ? `${dashboard.stats.activeRuns} 个任务进行中` : "暂无活动任务" },
    { key: "candidates", label: "今日候选码", value: dashboard.stats.candidates, hint: `${pendingCandidates.length} 条等待审核`, status: pendingCandidates.length ? "warning" as const : "success" as const },
    { key: "success", label: "今日正式入库", value: dashboard.stats.success, hint: `${dashboard.stats.builds} 个方案持续维护`, status: "success" as const },
    { key: "failed", label: "今日失败", value: dashboard.stats.failed, hint: dashboard.stats.failed ? "查看任务错误" : "运行稳定", status: dashboard.stats.failed ? "danger" as const : "success" as const },
    { key: "confidence", label: "平均码可信度", value: dashboard.stats.confidence.toFixed(2), hint: "基于今日识别结果", status: dashboard.stats.confidence >= .85 ? "success" as const : "warning" as const },
  ];

  return (
    <div className="page dashboard-page">
      <PageHeader
        eyebrow="OPERATIONS / TODAY"
        title="数据情报工作台"
        description="聚焦异常与待确认数据，低频增量读取白名单博主的视频简介。"
        actions={<ActionGroup>
          {canOperate(user.role) ? <ActionButton kind="secondary" icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>手动导入</ActionButton> : null}
          {canOperate(user.role) ? <crawlFetcher.Form method="post"><ActionButton kind="primary" htmlType="submit" name="intent" value="crawl-all" icon={<PlayCircleFilled />} loading={crawlFetcher.state !== "idle"}>立即抓取</ActionButton></crawlFetcher.Form> : null}
        </ActionGroup>}
      />
      <div className="system-status-bar">
        <StatusBadge status={!worker.online ? "danger" : dashboard.stats.failed ? "warning" : "success"} label={!worker.online ? "Worker 离线" : dashboard.stats.failed ? "存在失败任务" : "系统运行正常"} />
        <span>{worker.online ? "PostgreSQL 与 Worker 已连接" : "PostgreSQL 已连接，抓取 Worker 未运行"}</span>
        <span className="status-detail">抓取范围：视频简介 · 最近 30 条 · Asia/Shanghai</span>
      </div>
      <MetricGrid items={metrics} />
      <WorkbenchPanel
        className="attention-panel"
        title={<span className="attention-heading"><ExclamationCircleFilled />需要处理</span>}
        description={`${dashboard.stats.pendingWeapons} 个武器待确认，${pendingCandidates.length} 条候选待审核`}
        extra={<Space><Link to="/builds" prefetch="intent">武器确认</Link><Link to="/reviews" prefetch="intent">全部审核</Link></Space>}
      >
        <TaskInbox items={taskItems} />
      </WorkbenchPanel>
      <div className="workbench-grid">
        <WorkbenchPanel title="最近 7 天抓取趋势" description="扫描视频与识别候选码" extra={<Link to="/runs" prefetch="intent">查看任务 <RightOutlined /></Link>}>
          {trendData.some((item) => item.value > 0) ? <div className="dashboard-chart"><div className="dashboard-chart-legend" aria-label="图表图例"><Badge color="#0b9da8" text="扫描视频" /><Badge color="#c88a22" text="候选码" /></div><TrendChart data={trendData} /></div> : <div className="chart-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="抓取完成后将在这里显示趋势" /></div>}
          <div className="recent-activity">
            {runs.slice(0, 4).map((run) => <div className="activity-row" key={run.id}><span className="activity-icon">{run.status === "failed" ? <ExclamationCircleFilled /> : run.status === "succeeded" ? <CheckCircleFilled /> : <SyncOutlined spin={run.status === "running"} />}</span><div className="activity-copy"><strong>{run.creatorName} · {run.trigger === "manual" ? "手动抓取" : run.trigger === "schedule" ? "计划抓取" : "首次回溯"}</strong><span>扫描 {run.videosScanned} 个视频，发现 {run.candidatesFound} 个候选码</span></div><StatusBadge status={run.status === "failed" ? "danger" : run.status === "succeeded" ? "success" : "info"} label={run.status === "failed" ? "失败" : run.status === "succeeded" ? "完成" : "执行中"} /><span className="activity-time">{new Date(run.createdAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}</span></div>)}
          </div>
        </WorkbenchPanel>
        <WorkbenchPanel title="最新改枪方案" description={`${dashboard.stats.builds} 个方案已建立版本链`} extra={<Link to="/builds" prefetch="intent">查看码库 <RightOutlined /></Link>}>
          {builds.length ? builds.map((build) => <Link className="build-list-item" to={`/builds/${build.id}`} prefetch="intent" key={build.id}><div className="build-list-copy"><strong>{build.weaponName} · {build.buildName}</strong><span>{build.creatorName} · {build.sourcePublishedAt ? new Date(build.sourcePublishedAt).toLocaleDateString("zh-CN") : "发布时间未知"}</span></div><span className="build-version">v{build.currentVersion}</span><RightOutlined /></Link>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="审核通过后将生成正式方案" />}
        </WorkbenchPanel>
      </div>
      <FormModal title="手动导入简介文本" open={importOpen} onClose={() => setImportOpen(false)}>
        <Typography.Paragraph type="secondary">当接口和简介页面都不可用时，将简介原文粘贴到这里。系统使用同一套解析、审核和版本规则。</Typography.Paragraph>
        {importFetcher.data?.intent === "manual-import" ? <Alert type={importFetcher.data.ok ? "success" : "error"} showIcon title={importFetcher.data.message} /> : null}
        <importFetcher.Form method="post">
          <Typography.Text className="field-label">白名单博主</Typography.Text>
          <input type="hidden" name="creatorId" value={importCreatorId ?? ""} />
          <Select value={importCreatorId} onChange={setImportCreatorId} placeholder="选择文本所属博主" options={loaderData.creators.map((creator) => ({ value: creator.id, label: `${creator.name} · UID ${creator.bilibiliMid}` }))} showSearch optionFilterProp="label" />
          <Typography.Text className="field-label">B 站视频链接（可选）</Typography.Text>
          <Input name="sourceUrl" placeholder="https://www.bilibili.com/video/BV..." />
          <Typography.Text className="field-label">简介原文</Typography.Text>
          <Input.TextArea name="rawText" rows={9} maxLength={50_000} showCount placeholder="粘贴包含武器名、方案名和改枪码的简介文本" />
          <ActionButton className="modal-submit" kind="primary" htmlType="submit" name="intent" value="manual-import" loading={importFetcher.state !== "idle"} block>保存并识别</ActionButton>
        </importFetcher.Form>
      </FormModal>
    </div>
  );
}
