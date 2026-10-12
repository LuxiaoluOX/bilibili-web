import { Button, Tooltip } from "antd";
import type { ButtonProps } from "antd";
import type { MouseEvent, ReactNode } from "react";
import { useHref, useNavigate } from "react-router";

export type ActionButtonKind =
  | "primary"
  | "secondary"
  | "tertiary"
  | "link"
  | "danger"
  | "dangerPrimary";

export type ActionButtonScale = "page" | "row" | "icon";

type SharedActionButtonProps = Omit<
  ButtonProps,
  "type" | "color" | "variant" | "danger" | "size" | "href"
> & {
  kind?: ActionButtonKind;
  to?: string;
  href?: string;
  tooltip?: ReactNode;
};

type IconActionButtonProps = SharedActionButtonProps & {
  scale: "icon";
  "aria-label": string;
  tooltip?: ReactNode;
};

type TextActionButtonProps = SharedActionButtonProps & {
  scale?: "page" | "row";
};

export type ActionButtonProps = IconActionButtonProps | TextActionButtonProps;

export const actionButtonPreset = {
  primary: { color: "primary", variant: "solid" },
  secondary: { color: "default", variant: "outlined" },
  tertiary: { color: "default", variant: "text" },
  link: { color: "primary", variant: "link" },
  danger: { color: "danger", variant: "link" },
  dangerPrimary: { color: "danger", variant: "solid" },
} as const satisfies Record<ActionButtonKind, Pick<ButtonProps, "color" | "variant">>;

function isPlainPrimaryClick(event: MouseEvent<HTMLElement>) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function ActionButton({
  kind = "secondary",
  scale = "page",
  to,
  href,
  tooltip,
  className,
  onClick,
  loading,
  ...props
}: ActionButtonProps) {
  const navigate = useNavigate();
  const routeHref = useHref(to ?? ".");
  const resolvedHref = to ? routeHref : href;
  const preset = actionButtonPreset[kind];

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || loading) return;
    if (to && isPlainPrimaryClick(event) && props.target !== "_blank") {
      event.preventDefault();
      void navigate(to);
    }
  };

  const button = (
    <Button
      {...props}
      {...preset}
      href={resolvedHref}
      loading={loading}
      size={scale === "page" ? "large" : "middle"}
      className={`action-button action-button-${kind} action-button-${scale} ${className ?? ""}`.trim()}
      onClick={handleClick}
    />
  );

  return tooltip ? <Tooltip title={tooltip}>{button}</Tooltip> : button;
}
