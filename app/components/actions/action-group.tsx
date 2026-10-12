import { Space } from "antd";
import type { ReactNode } from "react";

export function ActionGroup({ children, wrap = false, compact = false }: { children: ReactNode; wrap?: boolean; compact?: boolean }) {
  return <Space className={`action-group${compact ? " action-group-compact" : ""}`} size={compact ? 0 : 8} wrap={wrap}>{children}</Space>;
}
