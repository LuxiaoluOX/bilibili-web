import { Popconfirm } from "antd";
import type { PopconfirmProps } from "antd";
import type { ReactNode } from "react";
import { ActionButton } from "./action-button";
import type { ActionButtonKind, ActionButtonProps } from "./action-button";

export type ConfirmActionProps = Omit<ActionButtonProps, "kind" | "onClick" | "scale" | "tooltip" | "aria-label"> & {
  title: ReactNode;
  description?: ReactNode;
  onConfirm: NonNullable<PopconfirmProps["onConfirm"]>;
  confirmLoading?: boolean;
  confirmText?: ReactNode;
  cancelText?: ReactNode;
  kind?: ActionButtonKind;
};

export function ConfirmAction({
  title,
  description,
  onConfirm,
  confirmLoading,
  confirmText = "确认",
  cancelText = "取消",
  kind = "danger",
  disabled,
  children,
  ...buttonProps
}: ConfirmActionProps) {
  return (
    <Popconfirm
      title={title}
      description={description}
      okText={confirmText}
      cancelText={cancelText}
      okButtonProps={{ danger: kind === "danger", loading: confirmLoading }}
      onConfirm={onConfirm}
      disabled={disabled}
    >
      <ActionButton {...buttonProps} kind={kind} scale="row" disabled={disabled}>{children}</ActionButton>
    </Popconfirm>
  );
}
