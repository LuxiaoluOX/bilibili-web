import { ClockCircleOutlined, DatabaseOutlined, KeyOutlined, RightOutlined, RobotOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { Alert, Empty, Progress, Segmented, Space, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { Link, useNavigate } from "react-router";
import type { Route } from "./+types/quality";
import { ActionButton } from "../components/actions/action-button";
import { StatusBadge, tablePagination, WorkbenchProTable } from "../components/data-display";
import { MetricGrid, PageHeader, TaskInbox, WorkbenchPanel } from "../components/layout";
import { requireUser } from "../lib/auth.server";
import { getDataQualityDashboard } from "../lib/data-quality.server";
import { normalizeQualityPeriod, qualityRateLabel, type QualityPeriodDays } from "../lib/data-quality";

export function meta() { return [{ title: "数据质量与告警中心 · 三角洲行动数据情报工作台" }]; }

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const periodDays = normalizeQualityPeriod(new URL(request.url).searchParams.get("period"));
  return getDataQualityDashboard(periodDays);
}

type StaleBuild = Route.ComponentProps["loaderData"]["staleBuilds"][number];

function rateStatus(rate: number | null, warningBelow: number) {
  if (rate === null) return "neutral" as const;
  if (rate >= 95) return "success" as const;
  if (rate >= warningBelow) return "warning" as const;
  return "danger" as const;
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" }) : "从未记录";
}

function RateRow({ label, rate, detail }: { label: string; rate: number | null; detail: string }) {
  const status = rateStatus(rate, 80);
  const strokeColor = status === "success" ? "#1c9a72" : status === "warning" ? "#c88a22" : status === "danger" ? "#d95050" : "#b6bfbc";
  return <div className="quality-rate-row"><div className="quality-rate-copy"><strong>{label}</strong><span>{detail}</span></div><Progress percent={rate ?? 0} strokeColor={strokeColor} railColor="#edf0ed" format={() => qualityRateLabel(rate)} /></div>;
}

export default function QualityCenter({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate();
  const workerLabel = loaderData.worker.online ? "在线" : loaderData.worker.state === "never_seen" ? "未启动" : "离线";
  const credentialHealthy = loaderData.credential.configured && loaderData.credential.status === "valid";
  const hasDanger = !loaderData.worker.online || loaderData.worker.staleRuns > 0 || !credentialHealthy;
  const hasWarning = loaderData.modeIntegrity.issueCount > 0 || loaderData.staleBuilds.length > 0;
  const overallStatus = hasDanger ? "danger" as const : hasWarning ? "warning" as const : "success" as const;
  const capturedAt = new Date(loaderData.capturedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });

  const alerts = [
    ...(!loaderData.worker.online ? [{ id: "worker", title: `抓取 Worker ${workerLabel}`, description: loaderData.worker.lastHeartbeatAt ? `最后心跳 ${new Date(loaderData.worker.lastHeartbeatAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}；恢复前排队任务不会执行。` : "尚未记录 Worker 心跳；排队任务不会执行。", meta: `可执行 ${loaderData.worker.readyRuns} · 延迟 ${loaderData.worker.delayedRuns} · 卡住 ${loaderData.worker.staleRuns}`, status: "danger" as const, action: <ActionButton kind="secondary" scale="row" to="/runs">查看任务 <RightOutlined /></ActionButton> }] : loaderData.worker.staleRuns > 0 ? [{ id: "stale-runs", title: `${loaderData.worker.staleRuns} 个任务心跳过期`, description: "运行任务超过 15 分钟没有心跳，Worker 将按可靠性策略重新排队或标记失败。", status: "danger" as const, action: <ActionButton kind="secondary" scale="row" to="/runs">查看任务 <RightOutlined /></ActionButton> }] : []),
    ...(!credentialHealthy ? [{ id: "credential", title: loaderData.credential.configured ? "B 站会话不可用" : "B 站会话未配置", description: loaderData.credential.configured ? `当前状态为 ${loaderData.credential.status}，可能影响 API 抓取和会话校验。` : "尚未保存 B 站会话，受限接口可能无法抓取。", meta: loaderData.credential.lastCheckedAt ? `最后校验 ${new Date(loaderData.credential.lastCheckedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}` : "尚无校验记录", status: "danger" as const, action: <ActionButton kind="secondary" scale="row" to="/bilibili-session">处理会话 <RightOutlined /></ActionButton> }] : []),
    ...(loaderData.modeIntegrity.issueCount > 0 ? [{ id: "mode-integrity", title: `${loaderData.modeIntegrity.issueCount} 个行动模式完整性问题`, description: `未知来源 ${loaderData.modeIntegrity.unknownSources} · 未知候选 ${loaderData.modeIntegrity.unknownCandidates} · 跨层不一致 ${loaderData.modeIntegrity.sourceCandidateMismatches + loaderData.modeIntegrity.versionSourceMismatches + loaderData.modeIntegrity.buildVersionMismatches}`, status: "warning" as const, action: <ActionButton kind="secondary" scale="row" to="/builds">前往治理 <RightOutlined /></ActionButton> }] : []),
    ...(loaderData.staleBuilds.length > 0 ? [{ id: "stale-builds", title: `${loaderData.staleBuilds.length} 个方案超过 ${loaderData.staleBuildDays} 天无新来源`, description: "这表示来源新鲜度不足，不等于方案已经失效；请优先核对仍活跃的创作者。", status: "warning" as const, action: <ActionButton kind="secondary" scale="row" to="#stale-builds">查看明细 <RightOutlined /></ActionButton> }] : []),
  ];

  const columns: ColumnsType<StaleBuild> = [
    { title: "武器 / 方案", key: "build", fixed: "left", width: 260, render: (_, row) => <Link to={`/builds/${row.id}`} prefetch="intent"><strong>{row.weaponName}</strong><br /><Typography.Text type="secondary">{row.buildName}</Typography.Text></Link> },
    { title: "创作者", dataIndex: "creatorName", width: 160 },
    { title: "最后来源日期", dataIndex: "latestSourcePublishedAt", width: 150, align: "center", render: formatDate },
    { title: "未更新天数", dataIndex: "daysWithoutSource", width: 130, align: "right", render: (value: number | null) => value === null ? "未知" : `${value} 天` },
  ];

  return <div className="page quality-page">
    <PageHeader eyebrow="DATA QUALITY / ALERTS" title="数据质量与告警中心" description="用一致口径监控抓取、解析、自动入库与来源新鲜度；异常只指向现有治理入口。" actions={<Segmented<QualityPeriodDays> aria-label="选择质量指标观察周期" value={loaderData.periodDays} options={[{ label: "近 30 天", value: 30 }, { label: "近 90 天", value: 90 }]} onChange={(value) => void navigate(`/quality?period=${value}`)} />} />
    <div className={`system-status-bar quality-status quality-status-${overallStatus}`}><StatusBadge status={overallStatus} label={overallStatus === "success" ? "数据链路正常" : overallStatus === "warning" ? "存在质量提醒" : "存在运行异常"} /><span>统计周期：近 {loaderData.periodDays} 天</span><span className="status-detail">最近观测：{formatDate(loaderData.latestObservedAt)} · 生成于 {capturedAt}</span></div>
    <MetricGrid items={[
      { key: "crawl", label: "抓取成功率", value: qualityRateLabel(loaderData.crawl.rate), hint: `完整成功 ${loaderData.crawl.successfulRuns} / 已结束 ${loaderData.crawl.finishedRuns}；部分成功 ${loaderData.crawl.partialRuns}`, status: rateStatus(loaderData.crawl.rate, 80) },
      { key: "parse", label: "解析率", value: qualityRateLabel(loaderData.parsing.rate), hint: `产出候选的来源 ${loaderData.parsing.parsedSources} / 新增来源 ${loaderData.parsing.sources}`, status: rateStatus(loaderData.parsing.rate, 60) },
      { key: "auto", label: "自动入库率", value: qualityRateLabel(loaderData.autoIngest.rate), hint: `自动接受 ${loaderData.autoIngest.autoIngestedCandidates} / 可处理候选 ${loaderData.autoIngest.actionableCandidates}`, status: rateStatus(loaderData.autoIngest.rate, 60) },
      { key: "unknown", label: "未知模式", value: loaderData.modeIntegrity.unknownSources + loaderData.modeIntegrity.unknownCandidates + loaderData.modeIntegrity.unknownVersions + loaderData.modeIntegrity.unknownBuilds, hint: "全库当前四层未知记录", status: loaderData.modeIntegrity.issueCount ? "warning" : "success" },
      { key: "stale", label: "长期未更新方案", value: loaderData.staleBuilds.length, hint: `超过 ${loaderData.staleBuildDays} 天无新来源`, status: loaderData.staleBuilds.length ? "warning" : "success" },
      { key: "runtime", label: "运行保障", value: hasDanger ? "异常" : "正常", hint: `Worker ${workerLabel} · B 站会话 ${credentialHealthy ? "有效" : "异常"}`, status: hasDanger ? "danger" : "success" },
    ]} />
    <Alert className="quality-definition-alert" type="info" showIcon title="指标口径" description="抓取成功率只把完整成功计入分子；解析率按新增来源是否产出候选计算；自动入库率只统计无需人工审核即接受的可处理候选。分母为 0 时显示“暂无数据”，不会伪装成 0%。" />
    <div className="quality-grid">
      <WorkbenchPanel title="质量漏斗" description={`近 ${loaderData.periodDays} 天的分子、分母与例外`}><div className="quality-rate-list"><RateRow label="抓取成功率" rate={loaderData.crawl.rate} detail={`完整成功 ${loaderData.crawl.successfulRuns}，部分成功 ${loaderData.crawl.partialRuns}，失败 ${loaderData.crawl.failedRuns}`} /><RateRow label="解析率" rate={loaderData.parsing.rate} detail={`${loaderData.parsing.parsedSources} 个来源产出候选，共新增 ${loaderData.parsing.sources} 个来源`} /><RateRow label="自动入库率" rate={loaderData.autoIngest.rate} detail={`${loaderData.autoIngest.autoIngestedCandidates} 条自动接受，共 ${loaderData.autoIngest.actionableCandidates} 条可处理候选`} /></div></WorkbenchPanel>
      <WorkbenchPanel title="链路状态" description="当前状态，不受观察周期影响"><div className="quality-health-list"><div><RobotOutlined /><span><strong>抓取 Worker</strong><small>{workerLabel} · 卡住任务 {loaderData.worker.staleRuns}</small></span><StatusBadge status={loaderData.worker.online && !loaderData.worker.staleRuns ? "success" : "danger"} /></div><div><KeyOutlined /><span><strong>B 站会话</strong><small>{credentialHealthy ? `有效 · ${loaderData.credential.accountName ?? "账号未命名"}` : "需要配置或重新验证"}</small></span><StatusBadge status={credentialHealthy ? "success" : "danger"} /></div><div><DatabaseOutlined /><span><strong>行动模式投影</strong><small>来源、候选、版本、方案四层</small></span><StatusBadge status={loaderData.modeIntegrity.healthy ? "success" : "warning"} /></div><div><ClockCircleOutlined /><span><strong>来源新鲜度</strong><small>{loaderData.staleBuilds.length} 个方案超过 {loaderData.staleBuildDays} 天</small></span><StatusBadge status={loaderData.staleBuilds.length ? "warning" : "success"} /></div></div></WorkbenchPanel>
    </div>
    <WorkbenchPanel className="quality-alert-panel" title={<Space><SafetyCertificateOutlined />告警队列</Space>} description={`${alerts.length} 项当前异常或提醒`}><TaskInbox items={alerts} emptyText="当前没有需要处理的数据质量告警" /></WorkbenchPanel>
    <section className="quality-stale-section" id="stale-builds" aria-labelledby="stale-builds-title"><div className="quality-section-heading"><div><h2 id="stale-builds-title">长期未更新方案</h2><p>按方案最后来源发布时间判断，阈值为 {loaderData.staleBuildDays} 天；仅表示需要复核来源新鲜度。</p></div><StatusBadge status={loaderData.staleBuilds.length ? "warning" : "success"} label={`${loaderData.staleBuilds.length} 个方案`} /></div>{loaderData.staleBuilds.length ? <div className="table-section"><WorkbenchProTable preferenceKey="quality-stale-builds" rowKey="id" columns={columns} dataSource={loaderData.staleBuilds} scroll={{ x: 700 }} pagination={tablePagination(10, "个方案")} /></div> : <div className="quality-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前没有长期未更新方案" /></div>}</section>
  </div>;
}
