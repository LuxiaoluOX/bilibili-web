import {
  CheckCircleFilled,
  ClockCircleOutlined,
  CloseCircleFilled,
  ExclamationCircleFilled,
  InfoCircleFilled,
} from "@ant-design/icons";
import type { ReactNode } from "react";

export type SemanticStatus = "success" | "warning" | "danger" | "info" | "neutral";

const statusMeta: Record<SemanticStatus, { label: string; icon: ReactNode }> = {
  success: { label: "正常", icon: <CheckCircleFilled /> },
  warning: { label: "需处理", icon: <ExclamationCircleFilled /> },
  danger: { label: "异常", icon: <CloseCircleFilled /> },
  info: { label: "进行中", icon: <InfoCircleFilled /> },
  neutral: { label: "未开始", icon: <ClockCircleOutlined /> },
};

export function StatusBadge({ status, label }: { status: SemanticStatus; label?: ReactNode }) {
  return <span className={`semantic-status semantic-status-${status}`}>{statusMeta[status].icon}<span>{label ?? statusMeta[status].label}</span></span>;
}
