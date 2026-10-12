import { ProCard } from "@ant-design/pro-components";
import type { ReactNode } from "react";

export function FilterBar({ main, aside, label = "列表筛选与操作" }: { main: ReactNode; aside?: ReactNode; label?: string }) {
  return (
    <ProCard className="data-toolbar" aria-label={label} styles={{ body: { padding: 12 } }}>
      <div className="data-toolbar-inner">
        <div className="data-toolbar-main">{main}</div>
        {aside ? <div className="data-toolbar-aside">{aside}</div> : null}
      </div>
    </ProCard>
  );
}

export const DataToolbar = FilterBar;
