import { CheckOutlined, CloseOutlined, EditOutlined, RightOutlined, SearchOutlined, VideoCameraOutlined } from "@ant-design/icons";
import { ProFormText } from "@ant-design/pro-components";
import { Alert, Empty, Input, Space, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Key } from "react";
import { useEffect, useMemo, useState } from "react";
import { data, Form, Link, useFetcher, useSearchParams } from "react-router";
import type { Route } from "./+types/reviews";
import { ActionButton, ActionGroup, ConfirmAction } from "../components/actions";
import { CodeValue, CountTag, StatusBadge, tablePagination, WorkbenchProTable } from "../components/data-display";
import { useFetcherToast } from "../components/feedback";
import { DataToolbar, FormModal } from "../components/forms";
import { PageHeader } from "../components/layout";
import { audit } from "../lib/audit.server";
import { requireRole, requireUser } from "../lib/auth.server";
import { acceptCandidate, acceptCandidates } from "../lib/crawler.server";
import { canOperate } from "../lib/domain";
import { GAME_MODE_LABELS, GAME_MODE_OPTIONS, isGameMode, type GameMode } from "../lib/game-modes";
import { listReviewQueue, type ReviewQueueFilters } from "../lib/repository.server";
import { CandidateReviewConflictError, CandidateReviewValidationError, rejectPendingCandidates } from "../lib/review.server";

export function meta() { return [{ title: "数据审核 · 三角洲行动数据情报工作台" }]; }

const attributionOptions = [
  { value: "", label: "全部归属状态" },
  { value: "resolved", label: "已确认武器" },
  { value: "unresolved", label: "待确认武器" },
];
const confidenceOptions = [
  { value: "", label: "全部可信度" },
  { value: "low", label: "低于 0.75" },
  { value: "medium", label: "0.75–0.89" },
  { value: "high", label: "0.90 及以上" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const url = new URL(request.url);
  const requestedMode = url.searchParams.get("gameMode");
  const requestedAttribution = url.searchParams.get("attribution");
  const requestedConfidence = url.searchParams.get("confidence");
  const filters: Required<ReviewQueueFilters> = {
    search: url.searchParams.get("q") ?? "",
    gameMode: isGameMode(requestedMode) ? requestedMode : "" as const,
    attribution: requestedAttribution === "resolved" || requestedAttribution === "unresolved" ? requestedAttribution : "" as const,
    confidence: requestedConfidence === "low" || requestedConfidence === "medium" || requestedConfidence === "high" ? requestedConfidence : "" as const,
    page: Number(url.searchParams.get("page")) || 1,
    pageSize: Number(url.searchParams.get("pageSize")) || 20,
  };
  return { user, queue: await listReviewQueue(filters), filters };
}

function candidateIds(form: FormData) {
  return [...new Set(form.getAll("candidateId").map(String).filter((value) => /^[0-9a-f-]{36}$/i.test(value)))];
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireRole(request, ["admin", "operator"]);
  const form = await request.formData();
  const ids = candidateIds(form);
  const id = ids[0] ?? "";
  const intent = String(form.get("intent"));

  if (intent === "batch-reject") {
    if (!ids.length) return data({ ok: false, message: "请至少选择一条候选记录" }, { status: 400 });
    try {
      const count = await rejectPendingCandidates(ids, user.id);
      await audit(user.id, "candidates.batch-rejected", "candidate", undefined, { ids, count });
      return data({ ok: true, message: `已拒绝 ${count} 条候选记录` });
    } catch (error) {
      if (error instanceof CandidateReviewConflictError) return data({ ok: false, message: error.message }, { status: 409 });
      throw error;
    }
  }
  if (intent === "batch-accept") {
    if (!ids.length) return data({ ok: false, message: "请至少选择一条候选记录" }, { status: 400 });
    try {
      const count = await acceptCandidates(ids, user.id);
      await audit(user.id, "candidates.batch-accepted", "candidate", undefined, { ids });
      return data({ ok: true, message: `已通过并入库 ${count} 条候选记录` });
    } catch (error) {
      if (error instanceof CandidateReviewConflictError) return data({ ok: false, message: error.message }, { status: 409 });
      if (error instanceof CandidateReviewValidationError) return data({ ok: false, message: "所选记录中包含尚未确认武器或方案的候选" }, { status: 400 });
      throw error;
    }
  }
  if (intent === "reject") {
    try {
      await rejectPendingCandidates([id], user.id);
      await audit(user.id, "candidate.rejected", "candidate", id);
      return data({ ok: true, message: "已拒绝该候选项" });
    } catch (error) {
      if (error instanceof CandidateReviewConflictError) return data({ ok: false, message: error.message }, { status: 409 });
      throw error;
    }
  }
  if (intent !== "accept" && intent !== "correct") {
    return data({ ok: false, message: "未知审核操作" }, { status: 400 });
  }
  const requestedMode = form.get("gameMode");
  try {
    await acceptCandidate(id, user.id, {
      weaponName: String(form.get("weaponName") ?? "") || undefined,
      buildName: String(form.get("buildName") ?? "") || undefined,
      gameMode: isGameMode(requestedMode) ? requestedMode : undefined,
    });
    await audit(user.id, intent === "correct" ? "candidate.corrected" : "candidate.accepted", "candidate", id);
    return data({ ok: true, message: intent === "correct" ? "修正并入库完成" : "已通过并写入版本库" });
  } catch (error) {
    if (error instanceof CandidateReviewConflictError) return data({ ok: false, message: error.message }, { status: 409 });
    if (error instanceof CandidateReviewValidationError) return data({ ok: false, message: error.message }, { status: 400 });
    throw error;
  }
}

type Candidate = Awaited<ReturnType<typeof listReviewQueue>>["items"][number];

export default function Reviews({ loaderData }: Route.ComponentProps) {
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Key[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher<typeof action>();
  useFetcherToast(fetcher, { loading: "正在提交审核…" });
  const editable = canOperate(loaderData.user.role);
  const activeId = fetcher.formData?.get("candidateId");
  const unresolved = loaderData.queue.items.filter((item) => !item.weapon_name).length;
  const selectedRows = useMemo(() => loaderData.queue.items.filter((item) => selectedKeys.includes(item.id)), [loaderData.queue.items, selectedKeys]);
  const batchAcceptable = selectedKeys.length > 0 && selectedRows.length === selectedKeys.length && selectedRows.every((item) => item.weapon_name);
  const filterSignature = `${loaderData.filters.search}|${loaderData.filters.gameMode}|${loaderData.filters.attribution}|${loaderData.filters.confidence}|${loaderData.queue.page}|${loaderData.queue.pageSize}`;

  useEffect(() => { setSelectedKeys([]); }, [filterSignature]);
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) setSelectedKeys([]);
  }, [fetcher.state, fetcher.data]);

  const submitBatch = (intent: "batch-accept" | "batch-reject") => {
    const form = new FormData();
    form.set("intent", intent);
    for (const key of selectedKeys) form.append("candidateId", String(key));
    fetcher.submit(form, { method: "post" });
  };

  const changePage = (page: number, pageSize: number) => {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(pageSize === loaderData.queue.pageSize ? page : 1));
    next.set("pageSize", String(pageSize));
    setSearchParams(next);
  };

  const columns: ColumnsType<Candidate> = [
    { title: "来源与上下文", dataIndex: "video_title", fixed: "left", width: 310, align: "left", render: (value, row) => <Space align="start"><span className="video-thumb"><VideoCameraOutlined /></span><div className="video-title"><Typography.Text strong ellipsis={{ tooltip: value }}>{value}</Typography.Text><br /><Typography.Link href={row.source_url} target="_blank">{row.creator_name} · 查看简介</Typography.Link></div></Space> },
    { title: "建议归属", width: 165, align: "left", render: (_, row) => <Space orientation="vertical" size={4}><Typography.Text strong>{row.weapon_name ?? row.suggested_weapon ?? "待识别"}</Typography.Text>{row.weapon_name ? <StatusBadge status="success" label="已确认武器" /> : <StatusBadge status="warning" label="需要确认武器" />}</Space> },
    { title: "模式", dataIndex: "gameMode", width: 120, align: "center", render: (value: GameMode) => <CountTag tone={value === "unknown" ? "amber" : "cyan"}>{GAME_MODE_LABELS[value]}</CountTag> },
    { title: "方案", dataIndex: "build_name", width: 200, align: "left", render: (value) => value ?? <Typography.Text type="secondary">未命名方案</Typography.Text> },
    { title: "候选改枪码", dataIndex: "normalized_code", width: 235, align: "left", render: (value) => <CodeValue value={value} /> },
    { title: "可信度", width: 190, align: "center", render: (_, row) => <Space orientation="vertical" size={5}><CountTag tone={row.codeConfidence >= .85 ? "green" : "amber"}>改枪码 {row.codeConfidence.toFixed(2)}</CountTag><CountTag tone={row.attributionStatus === "resolved" ? "cyan" : "amber"}>武器归属 {row.weaponConfidence.toFixed(2)}</CountTag></Space> },
    { title: "决策", fixed: "right", width: 250, align: "center", render: (_, row) => editable ? <ActionGroup compact><fetcher.Form method="post"><input type="hidden" name="candidateId" value={row.id} /><input type="hidden" name="gameMode" value={row.gameMode} />{row.weapon_name ? <ActionButton kind="link" scale="row" htmlType="submit" name="intent" value="accept" icon={<CheckOutlined />} loading={activeId === row.id && fetcher.formData?.get("intent") === "accept"}>通过</ActionButton> : null}<ActionButton kind="danger" scale="row" htmlType="submit" name="intent" value="reject" icon={<CloseOutlined />} loading={activeId === row.id && fetcher.formData?.get("intent") === "reject"}>拒绝</ActionButton></fetcher.Form><ActionButton kind="link" scale="row" icon={<EditOutlined />} onClick={() => setEditing(row)}>修正</ActionButton>{!row.weapon_name ? <ActionButton kind="link" scale="row" to="/builds?gameMode=unknown">确认武器 <RightOutlined /></ActionButton> : null}</ActionGroup> : "只读" },
  ];

  return <div className="page review-queue-page">
    <PageHeader eyebrow="REVIEW QUEUE" title="数据审核" description="筛选并处理全部待审核候选；批量操作只作用于当前明确选择的记录。" actions={<CountTag tone={loaderData.queue.total ? "amber" : "green"}>{loaderData.queue.total} 条待审核</CountTag>} />
    {unresolved ? <Alert className="settings-alert" type="warning" showIcon title={`当前页有 ${unresolved} 条候选尚未确认武器`} description={<>这类记录不能批量通过，请先完成武器确认或别名映射。<Link to="/builds?gameMode=unknown" prefetch="intent">前往模式治理</Link></>} /> : null}
    <DataToolbar main={<Form method="get" className="review-filter-form"><Input name="q" defaultValue={loaderData.filters.search} prefix={<SearchOutlined />} placeholder="搜索视频、博主、武器、方案或改枪码" allowClear/><select name="gameMode" defaultValue={loaderData.filters.gameMode} className="native-select">{[{ value: "", label: "全部模式" }, ...GAME_MODE_OPTIONS].map((option) => <option key={option.value || "all"} value={option.value}>{option.label}</option>)}</select><select name="attribution" defaultValue={loaderData.filters.attribution} className="native-select">{attributionOptions.map((option) => <option key={option.value || "all"} value={option.value}>{option.label}</option>)}</select><select name="confidence" defaultValue={loaderData.filters.confidence} className="native-select">{confidenceOptions.map((option) => <option key={option.value || "all"} value={option.value}>{option.label}</option>)}</select><ActionButton kind="secondary" htmlType="submit">筛选</ActionButton></Form>} aside={<Typography.Text type="secondary">第 {loaderData.queue.page} 页 · 共 {loaderData.queue.total} 条</Typography.Text>} />
    <section className="table-section">
      <WorkbenchProTable
        preferenceKey="reviews"
        rowKey="id"
        columns={columns}
        dataSource={loaderData.queue.items}
        rowSelection={editable ? { selectedRowKeys: selectedKeys, onChange: setSelectedKeys, preserveSelectedRowKeys: false } : undefined}
        toolBarRender={() => editable ? [<div className="review-batch-actions" key="review-batch-actions"><Typography.Text type="secondary">已选 {selectedKeys.length} 条</Typography.Text><ConfirmAction title="批量通过并入库？" description={batchAcceptable ? `将处理 ${selectedKeys.length} 条已确认武器的候选记录。` : "所选记录必须全部已确认武器。"} confirmText="确认通过" disabled={!batchAcceptable} onConfirm={() => submitBatch("batch-accept")} kind="primary" loading={fetcher.state !== "idle"}>批量通过</ConfirmAction><ConfirmAction title="批量拒绝候选？" description={`将拒绝所选 ${selectedKeys.length} 条记录，操作会写入审计日志。`} confirmText="确认拒绝" disabled={!selectedKeys.length} onConfirm={() => submitBatch("batch-reject")} loading={fetcher.state !== "idle"}>批量拒绝</ConfirmAction></div>] : []}
        scroll={{ x: 1360 }}
        pagination={{ ...tablePagination(loaderData.queue.pageSize, "条候选"), current: loaderData.queue.page, pageSize: loaderData.queue.pageSize, total: loaderData.queue.total, hideOnSinglePage: false, onChange: changePage }}
        locale={{ emptyText: <Empty description={loaderData.queue.total ? "当前页没有候选记录" : "没有符合筛选条件的待审核候选"} /> }}
      />
    </section>
    <FormModal title="修正候选信息" open={Boolean(editing)} onClose={() => setEditing(null)}>
      {editing ? <><Alert type="info" showIcon title="提交后将重新归属版本链" description={`原识别：${editing.weapon_name ?? editing.suggested_weapon ?? "未知武器"} · ${editing.build_name ?? "未命名方案"}`} /><fetcher.Form method="post" onSubmit={() => setEditing(null)}><input type="hidden" name="candidateId" value={editing.id} /><ProFormText name="weaponName" label="武器名称" initialValue={editing.weapon_name ?? editing.suggested_weapon ?? ""} /><ProFormText name="buildName" label="方案名称" initialValue={editing.build_name ?? ""} /><Typography.Text className="field-label">游戏模式</Typography.Text><select name="gameMode" defaultValue={editing.gameMode} className="native-select">{GAME_MODE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ProFormText label="改枪码（不可修改）" fieldProps={{ value: editing.normalized_code, disabled: true }} /><ActionButton className="modal-submit" kind="primary" htmlType="submit" name="intent" value="correct" block loading={fetcher.state !== "idle"}>修正并入库</ActionButton></fetcher.Form></> : null}
    </FormModal>
  </div>;
}
