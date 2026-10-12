import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { Empty, Input, Space, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import type { Route } from "./+types/design-system";
import { ActionButton, ActionGroup, ConfirmAction } from "../components/actions";
import { CodeValue, CountTag, DateCell, EntityCell, StatusBadge, tablePagination, WorkbenchProTable } from "../components/data-display";
import { ActionDrawer, FilterBar, FormError, FormModal } from "../components/forms";
import { PageHeader, WorkbenchPanel } from "../components/layout";
import { requireRole } from "../lib/auth.server";

export function meta() {
  return [{ title: "组件规范 · 三角洲行动数据情报工作台" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireRole(request, ["admin"]);
  return null;
}

type DemoRow = {
  id: string;
  name: string;
  code: string;
  status: "success" | "warning";
  updatedAt: string;
};

const demoRows: DemoRow[] = [
  { id: "1", name: "SCAR 标准管强化中高改版", code: "6KRIHA007FI7MVPVB9B3H", status: "success", updatedAt: "2026-09-01T12:07:47+08:00" },
  { id: "2", name: "M7 稳定型均衡版", code: "6KJ60G00B1RRH96DI8AIT", status: "warning", updatedAt: "2026-08-28T09:30:00+08:00" },
];

export default function DesignSystem() {
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const columns: ColumnsType<DemoRow> = [
    { title: "方案", dataIndex: "name", fixed: "left", align: "left", render: (value) => <EntityCell title={value} description="Always聪聪 · 突击步枪" /> },
    { title: "改枪码", dataIndex: "code", width: 260, render: (value) => <CodeValue value={value} /> },
    { title: "状态", dataIndex: "status", width: 120, align: "center", render: (value) => <StatusBadge status={value} label={value === "success" ? "已确认" : "待审核"} /> },
    { title: "更新时间", dataIndex: "updatedAt", width: 190, align: "center", render: (value) => <DateCell value={value} /> },
    { title: "操作", width: 100, align: "center", render: () => <ActionButton kind="link" scale="row">查看</ActionButton> },
  ];

  return (
    <div className="page design-system-page">
      <PageHeader
        eyebrow="COMPONENT STANDARD"
        title="组件规范"
        description="当前项目的操作层级、状态表达与数据展示基准；新增页面应优先复用这里的组件。"
        actions={<ActionButton kind="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>打开表单示例</ActionButton>}
      />

      <div className="component-catalog-grid">
        <WorkbenchPanel className="component-catalog-section" title="按钮层级" description="同一区域最多保留一个主操作">
          <div className="component-catalog-demo">
            <ActionButton kind="primary" icon={<PlusOutlined />}>主操作</ActionButton>
            <ActionButton kind="secondary">次级操作</ActionButton>
            <ActionButton kind="tertiary">弱操作</ActionButton>
            <ActionButton kind="link">行内链接</ActionButton>
            <ActionButton kind="danger">危险操作</ActionButton>
            <ActionButton kind="dangerPrimary">确认删除</ActionButton>
          </div>
          <p className="component-catalog-rule">页面与表单使用 40px 控件；表格操作使用 row 尺度。危险主按钮只出现在最终确认区域。</p>
        </WorkbenchPanel>

        <WorkbenchPanel className="component-catalog-section" title="按钮状态" description="加载时自动阻止重复提交">
          <div className="component-catalog-demo">
            <ActionButton kind="primary" loading>正在保存</ActionButton>
            <ActionButton kind="secondary" disabled>不可用</ActionButton>
            <ActionButton scale="icon" kind="tertiary" aria-label="刷新示例" tooltip="刷新"><ReloadOutlined /></ActionButton>
            <ConfirmAction title="删除示例数据？" description="此处仅演示确认样式，不会产生数据变更。" onConfirm={() => undefined} icon={<DeleteOutlined />}>删除</ConfirmAction>
          </div>
          <p className="component-catalog-rule">图标按钮必须同时提供可访问名称和 Tooltip；破坏性操作必须经过统一确认。</p>
        </WorkbenchPanel>

        <WorkbenchPanel className="component-catalog-section" title="状态与标签" description="文字与图标共同传递状态">
          <div className="component-catalog-stack">
            <ActionGroup>
              <StatusBadge status="success" label="运行正常" />
              <StatusBadge status="warning" label="需要处理" />
              <StatusBadge status="danger" label="执行失败" />
              <StatusBadge status="neutral" label="已停用" />
            </ActionGroup>
            <ActionGroup><CountTag tone="cyan">S10</CountTag><CountTag tone="green">当前采用</CountTag><CountTag tone="amber">沿用</CountTag></ActionGroup>
          </div>
          <p className="component-catalog-rule">状态不只依靠颜色表达；短状态居中，业务对象和说明文字保持左对齐。</p>
        </WorkbenchPanel>

        <WorkbenchPanel className="component-catalog-section" title="数据单元格" description="主信息、辅助信息和可复制值保持稳定层级">
          <div className="component-catalog-stack">
            <EntityCell title="SCAR" description="突击步枪 · S1 起源" />
            <CodeValue value="6KRIHA007FI7MVPVB9B3H" />
            <DateCell value="2026-09-01T12:07:47+08:00" />
          </div>
          <p className="component-catalog-rule">空值统一显示“—”；编码使用等宽字并提供独立复制反馈。</p>
        </WorkbenchPanel>
      </div>

      <WorkbenchPanel title="筛选栏" description="搜索、筛选、重置和结果统计在同一操作带内">
        <FilterBar
          main={<Space wrap><Input prefix={<SearchOutlined />} placeholder="搜索武器或改枪码" /><ActionButton kind="secondary">搜索</ActionButton><ActionButton kind="tertiary">重置</ActionButton></Space>}
          aside={<Typography.Text type="secondary">共 2 条示例</Typography.Text>}
        />
      </WorkbenchPanel>

      <section className="table-section component-catalog-table">
        <WorkbenchProTable
          preferenceKey="design-system-demo"
          rowKey="id"
          columns={columns}
          dataSource={demoRows}
          scroll={{ x: 1050 }}
          pagination={tablePagination(10, "条示例")}
          locale={{ emptyText: <Empty description="暂无示例数据" /> }}
        />
      </section>

      <WorkbenchPanel title="覆盖层" description="弹窗用于短任务，抽屉用于保留页面上下文的配置任务">
        <div className="component-catalog-demo">
          <ActionButton kind="secondary" onClick={() => setModalOpen(true)}>表单弹窗</ActionButton>
          <ActionButton kind="secondary" icon={<EditOutlined />} onClick={() => setDrawerOpen(true)}>操作抽屉</ActionButton>
        </div>
      </WorkbenchPanel>

      <FormModal title="新增武器" open={modalOpen} onClose={() => setModalOpen(false)}>
        <Typography.Paragraph type="secondary">统一标题、说明、错误区和提交按钮顺序。</Typography.Paragraph>
        <label className="field-label" htmlFor="demo-weapon">标准武器名</label>
        <Input id="demo-weapon" placeholder="例如：SCAR" />
        <FormError>这是表单内错误位置示例。</FormError>
        <ActionButton className="modal-submit" kind="primary" block onClick={() => setModalOpen(false)}>保存示例</ActionButton>
      </FormModal>

      <ActionDrawer title="编辑抓取计划" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <div className="component-catalog-stack">
          <Typography.Paragraph type="secondary">抽屉适合需要参照当前列表上下文的编辑任务。</Typography.Paragraph>
          <Input placeholder="0 */12 * * *" />
          <ActionButton kind="primary" block onClick={() => setDrawerOpen(false)}>保存计划</ActionButton>
        </div>
      </ActionDrawer>
    </div>
  );
}
