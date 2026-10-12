import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import { App as AntApp, ConfigProvider, Result } from "antd";

import type { Route } from "./+types/root";
import "antd/dist/reset.css";
import "./app.css";
import "./components/component-library.css";
import { workbenchTheme } from "./theme";
import { ActionButton } from "./components/actions/action-button";

const runtimeNodeEnv = import.meta.env.DEV ? "development" : "production";

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/brand/delta-force-icon.png", type: "image/png" },
  { rel: "apple-touch-icon", href: "/brand/delta-force-icon.png" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script
          dangerouslySetInnerHTML={{
            __html: `globalThis.process ??= { env: { NODE_ENV: ${JSON.stringify(runtimeNodeEnv)} } };`,
          }}
        />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <ConfigProvider theme={workbenchTheme}>
      <AntApp message={{ maxCount: 3, duration: 2.5 }} notification={{ placement: "topRight", maxCount: 3 }}>
        <Outlet />
      </AntApp>
    </ConfigProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let status: "404" | "500" | "403" = "500";
  let message = "页面暂时不可用";
  let details = "发生了未预期的错误，请稍后重试。";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    status = error.status === 404 ? "404" : error.status === 403 ? "403" : "500";
    message = error.status === 404 ? "页面不存在" : error.status === 403 ? "没有访问权限" : "请求处理失败";
    details =
      error.status === 404
        ? "你访问的地址不存在，或页面已经移动。"
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="error-page">
      <Result status={status} title={message} subTitle={details} extra={<ActionButton kind="primary" to="/">返回工作台</ActionButton>} />
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
