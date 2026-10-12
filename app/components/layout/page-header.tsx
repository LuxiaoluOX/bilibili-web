import { PageContainer } from "@ant-design/pro-components";
import { Typography } from "antd";
import type { ReactNode } from "react";

export type PagePrimaryAction = {
  label: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
};

export type PageHeaderAction = {
  key: string;
  label: ReactNode;
  primary?: boolean;
  icon?: ReactNode;
  onClick?: () => void;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  description: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <PageContainer
      className="workbench-page-container"
      ghost
      header={{
        title,
        subTitle: eyebrow ? <span className="page-eyebrow">{eyebrow}</span> : undefined,
        extra: actions ? [<div className="page-header-actions" key="actions">{actions}</div>] : undefined,
      }}
    >
      <Typography.Paragraph className="page-description">{description}</Typography.Paragraph>
    </PageContainer>
  );
}
