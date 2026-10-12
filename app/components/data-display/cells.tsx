import { App, Tag, Tooltip, Typography } from "antd";
import type { ReactNode } from "react";
import { CopyOutlined } from "@ant-design/icons";
import { ActionButton } from "../actions/action-button";

export function CodeValue({ value }: { value: string }) {
  const { message } = App.useApp();
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    message.success("改枪码已复制");
  };
  return (
    <span className="code-value">
      <code>{value}</code>
      <ActionButton
        kind="tertiary"
        scale="icon"
        aria-label="复制改枪码"
        tooltip="复制改枪码"
        icon={<CopyOutlined />}
        onClick={copy}
      />
    </span>
  );
}

export function EntityCell({ title, description }: { title: ReactNode; description?: ReactNode }) {
  return <span className="entity-cell"><Typography.Text strong>{title}</Typography.Text>{description ? <Typography.Text type="secondary">{description}</Typography.Text> : null}</span>;
}

export function DateCell({ value, empty = "—" }: { value?: string | null; empty?: string }) {
  return <span className="date-cell">{value ? new Date(value).toLocaleString("zh-CN") : empty}</span>;
}

export function CountTag({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "cyan" | "amber" | "green" }) {
  return <Tag className={`count-tag count-tag-${tone}`}>{children}</Tag>;
}

export function AliasList({ values, empty = "—" }: { values: string[]; empty?: ReactNode }) {
  if (!values.length) return <>{empty}</>;
  const visible = values.slice(0, 3);
  const remaining = values.length - visible.length;
  return <span className="weapon-alias-cell">{visible.map((value) => <Tag key={value}>{value}</Tag>)}{remaining > 0 ? <Tooltip title={values.slice(3).join("、")}><span className="weapon-alias-more">+{remaining}</span></Tooltip> : null}</span>;
}
