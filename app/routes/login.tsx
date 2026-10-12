import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { Alert, Form, Input, Typography } from "antd";
import { data, redirect, useFetcher } from "react-router";
import type { Route } from "./+types/login";
import { getCurrentUser, login } from "../lib/auth.server";
import { ActionButton } from "../components/actions/action-button";
import { clearAccountLoginLimit, consumeLoginAttempt } from "../lib/login-rate-limit.server";

export function meta() { return [{ title: "登录 · 三角洲行动数据情报工作台" }]; }

export function safeReturnTo(value: string | null, origin = "http://localhost") {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return "/";
  const target = new URL(value, origin);
  if (target.origin !== new URL(origin).origin || target.pathname.startsWith("//")) return "/";
  if (/\.data$/.test(target.pathname)) return "/";
  return `${target.pathname}${target.search}${target.hash}`;
}

export async function loader({ request }: Route.LoaderArgs) {
  if (await getCurrentUser(request)) throw redirect("/");
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!username || !password) return data({ error: "请输入用户名和密码" }, { status: 400 });
  const rateLimit = await consumeLoginAttempt(username, request);
  if (!rateLimit.allowed) {
    return data(
      { error: "尝试次数过多，请稍后再试" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }
  const result = await login(username, password);
  if (!result) return data({ error: "用户名或密码错误" }, { status: 400 });
  await clearAccountLoginLimit(username);
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"), url.origin);
  throw redirect(returnTo, { headers: { "Set-Cookie": result.cookie } });
}

export default function Login({ actionData }: Route.ComponentProps) {
  const fetcher = useFetcher<typeof action>();
  const submitting = fetcher.state !== "idle";
  const error = fetcher.data?.error ?? actionData?.error;

  return (
    <main className="login-page">
      <section className="login-brand">
        <div className="brand-mark"><img src="/brand/delta-force-icon.png" alt="三角洲行动" /></div>
        <Typography.Title level={1}>把每一次改枪更新，沉淀成可追溯的情报。</Typography.Title>
        <Typography.Paragraph>只追踪白名单博主的视频简介，低频增量获取改枪码，并持续维护清晰的版本链。</Typography.Paragraph>
        <div className="login-grid" aria-hidden="true" />
      </section>
      <section className="login-panel">
        <div className="login-form-wrap">
          <Typography.Text className="eyebrow">DELTA INTELLIGENCE</Typography.Text>
          <Typography.Title level={2}>欢迎回来</Typography.Title>
          <Typography.Paragraph type="secondary">登录后管理抓取计划、审核候选码与查看版本历史。</Typography.Paragraph>
          {error ? <Alert type="error" showIcon title={error} /> : null}
          <Form
            layout="vertical"
            size="large"
            requiredMark={false}
            onFinish={(values: { username: string; password: string }) => fetcher.submit(values, { method: "post" })}
          >
            <Form.Item label="用户名" name="username" rules={[{ required: true }]}><Input name="username" prefix={<UserOutlined />} placeholder="请输入用户名" autoComplete="username" /></Form.Item>
            <Form.Item label="密码" name="password" rules={[{ required: true }]}><Input.Password name="password" prefix={<LockOutlined />} placeholder="输入密码" autoComplete="current-password" /></Form.Item>
            <ActionButton kind="primary" htmlType="submit" block loading={submitting} disabled={submitting}>登录</ActionButton>
          </Form>
        </div>
      </section>
    </main>
  );
}
