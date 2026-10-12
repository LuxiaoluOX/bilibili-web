import { ProCard, StatisticCard } from "@ant-design/pro-components";
import { Empty, Space, Typography } from "antd";
import type { ReactNode } from "react";
import { StatusBadge } from "../data-display/status";
import type { SemanticStatus } from "../data-display/status";

export type MetricItem = {
  key: string;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  status?: SemanticStatus;
};

export type TaskInboxItem = {
  id: string;
  title: string;
  description: ReactNode;
  meta?: ReactNode;
  status?: SemanticStatus;
  action?: ReactNode;
};

export function MetricGrid({ items }: { items: MetricItem[] }) {
  return (
    <StatisticCard.Group className="metric-grid" direction="row">
      {items.map((item) => (
        <StatisticCard
          key={item.key}
          className={`metric-card metric-${item.status ?? "neutral"}`}
          statistic={{ title: item.label, value: item.value as string | number }}
          footer={item.hint}
        />
      ))}
    </StatisticCard.Group>
  );
}

export function WorkbenchPanel({
  title,
  description,
  extra,
  children,
  className = "",
}: {
  title?: ReactNode;
  description?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return <ProCard className={`workbench-panel ${className}`} title={title} subTitle={description} extra={extra} variant="outlined" styles={{ body: { padding: 0 } }}>{children}</ProCard>;
}

export function TaskInbox({ items, emptyText = "当前没有需要处理的任务" }: { items: TaskInboxItem[]; emptyText?: string }) {
  if (!items.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />;
  return (
    <div className="task-inbox">
      {items.map((item) => (
        <article className="task-inbox-item" key={item.id}>
          <div className={`task-marker task-marker-${item.status ?? "warning"}`} aria-hidden="true" />
          <div className="task-copy">
            <Space size={10} wrap><Typography.Text strong>{item.title}</Typography.Text><StatusBadge status={item.status ?? "warning"} /></Space>
            <div className="task-description">{item.description}</div>
            {item.meta ? <div className="task-meta">{item.meta}</div> : null}
          </div>
          {item.action ? <div className="task-action">{item.action}</div> : null}
        </article>
      ))}
    </div>
  );
}
