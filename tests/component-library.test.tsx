import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { ActionButton, ConfirmAction, actionButtonPreset } from "../app/components";

describe("shared action components", () => {
  it("maps semantic kinds to Ant Design button treatments", () => {
    expect(actionButtonPreset.primary).toEqual({ color: "primary", variant: "solid" });
    expect(actionButtonPreset.secondary).toEqual({ color: "default", variant: "outlined" });
    expect(actionButtonPreset.dangerPrimary).toEqual({ color: "danger", variant: "solid" });
  });

  it("renders router-aware links without nested anchors", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/"]}>
        <ActionButton to="/builds" kind="primary">打开码库</ActionButton>
      </MemoryRouter>,
    );
    expect(html).toContain('href="/builds"');
    expect((html.match(/<a/g) ?? [])).toHaveLength(1);
    expect(html).not.toContain("<button");
  });

  it("exposes loading and disabled state on the same action", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ActionButton kind="primary" loading disabled>正在保存</ActionButton>
      </MemoryRouter>,
    );
    expect(html).toContain("ant-btn-loading");
    expect(html).toContain("disabled");
  });

  it("keeps destructive confirmation on the shared danger action", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ConfirmAction title="确认删除？" onConfirm={() => undefined}>删除</ConfirmAction>
      </MemoryRouter>,
    );
    expect(html).toContain("action-button-danger");
    expect(html).toContain("删除");
  });
});

describe("route component architecture", () => {
  const routesDir = join(process.cwd(), "app", "routes");
  const routeFiles = readdirSync(routesDir).filter((file) => file.endsWith(".tsx"));

  it.each(routeFiles)("%s uses the shared constrained components", (file) => {
    const source = readFileSync(join(routesDir, file), "utf8");
    expect(source).not.toMatch(/components\/workbench-ui/);
    expect(source).not.toMatch(/import\s*\{[^}]*\b(?:Button|Modal|Drawer|Popconfirm)\b[^}]*\}\s*from\s*["']antd["']/s);
  });
});
