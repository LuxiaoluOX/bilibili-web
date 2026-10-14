import { KeyOutlined, LockOutlined, QrcodeOutlined, RightOutlined, SafetyCertificateOutlined, UserOutlined } from "@ant-design/icons";
import { Alert, Avatar, Input, QRCode } from "antd";
import { useState } from "react";
import { data, useFetcher } from "react-router";
import type { Route } from "./+types/bilibili-session";
import { ActionButton } from "../components/actions";
import { StatusBadge } from "../components/data-display";
import { useFetcherToast } from "../components/feedback";
import { audit } from "../lib/audit.server";
import {
  BilibiliLoginError,
  generateQrLogin,
  isTrustedLocalRequest,
  loginWithPassword,
  pollQrLogin,
  validateBilibiliSession,
} from "../lib/bilibili-auth.server";
import { requireRole, requireUser } from "../lib/auth.server";
import { credentialStatus, getBilibiliCookie, saveBilibiliSession } from "../lib/credentials.server";
import { query } from "../lib/db.server";

export function meta() { return [{ title: "B站会话 · 三角洲行动数据中台" }]; }

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  return { user, credential: await credentialStatus(), localAccess: isTrustedLocalRequest(request) };
}

function loginFailure(intent: string, error: unknown) {
  const raw = error instanceof Error ? error.message : "B 站登录失败";
  const verification = error instanceof BilibiliLoginError && error.reason === "verification";
  return data({
    ok: false,
    intent,
    message: verification ? `${raw}。请改用扫码登录完成验证码、短信或设备确认。` : raw,
  }, { status: 400 });
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireRole(request, ["admin"]);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "qr-start") {
    try {
      const qr = await generateQrLogin();
      return data({ ok: true, intent, message: "二维码已生成，请使用 B 站 App 扫码", qr });
    } catch (error) {
      return loginFailure(intent, error);
    }
  }

  if (intent === "qr-poll") {
    const key = String(form.get("qrcodeKey") ?? "").trim();
    const url = String(form.get("qrcodeUrl") ?? "").trim();
    if (!key || !url) return data({ ok: false, intent, message: "二维码状态已丢失，请重新生成" }, { status: 400 });
    try {
      const result = await pollQrLogin(key);
      if (result.state !== "succeeded") return data({ ok: true, intent, message: result.message, qr: { key, url } });
      const account = await validateBilibiliSession(result.cookie);
      await saveBilibiliSession(result.cookie, user.id, "qr", account);
      return data({ ok: true, intent, message: `已连接 ${account.name}（UID ${account.mid}）` });
    } catch (error) {
      return loginFailure(intent, error);
    }
  }

  if (intent === "password") {
    if (!isTrustedLocalRequest(request)) {
      return data({ ok: false, intent, message: "账号密码仅允许通过本机 localhost 页面提交" }, { status: 403 });
    }
    const username = String(form.get("username") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (username.length < 3 || password.length < 6) return data({ ok: false, intent, message: "请输入有效的账号和密码" }, { status: 400 });
    try {
      const cookie = await loginWithPassword(username, password);
      const account = await validateBilibiliSession(cookie);
      await saveBilibiliSession(cookie, user.id, "password", account);
      return data({ ok: true, intent, message: `已连接 ${account.name}；账号密码未保存` });
    } catch (error) {
      return loginFailure(intent, error);
    }
  }

  if (intent === "manual") {
    if (!isTrustedLocalRequest(request)) {
      return data({ ok: false, intent, message: "Cookie 仅允许通过本机 localhost 页面提交" }, { status: 403 });
    }
    const cookie = String(form.get("cookie") ?? "").trim();
    if (cookie.length < 20) return data({ ok: false, intent, message: "Cookie 内容过短" }, { status: 400 });
    try {
      const account = await validateBilibiliSession(cookie);
      await saveBilibiliSession(cookie, user.id, "manual", account);
      return data({ ok: true, intent, message: `Cookie 已验证并连接 ${account.name}` });
    } catch (error) {
      return loginFailure(intent, error);
    }
  }

  if (intent === "check") {
    const cookie = await getBilibiliCookie();
    if (!cookie) return data({ ok: false, intent, message: "尚未配置 B 站会话" }, { status: 400 });
    try {
      const account = await validateBilibiliSession(cookie);
      await query(
        `update bilibili_credentials set status = 'valid', last_checked_at = now(), account_name = $1, account_mid = $2
         where id = (select id from bilibili_credentials order by updated_at desc limit 1)`,
        [account.name, account.mid],
      );
      await audit(user.id, "credential.checked", "bilibili_credential", undefined, { accountMid: account.mid });
      return data({ ok: true, intent, message: `会话有效：${account.name}（UID ${account.mid}）` });
    } catch (error) {
      await query(
        `update bilibili_credentials set status = 'invalid', last_checked_at = now()
         where id = (select id from bilibili_credentials order by updated_at desc limit 1)`,
      );
      return loginFailure(intent, error);
    }
  }

  return data({ ok: false, intent, message: "未知操作" }, { status: 400 });
}

const methodLabels: Record<string, string> = { qr: "扫码登录", password: "账号密码", manual: "手动 Cookie" };

export default function BilibiliSession({ loaderData }: Route.ComponentProps) {
  const qrFetcher = useFetcher<typeof action>();
  const passwordFetcher = useFetcher<typeof action>();
  const cookieFetcher = useFetcher<typeof action>();
  const checkFetcher = useFetcher<typeof action>();
  useFetcherToast(qrFetcher, { loading: "正在连接 B 站…" });
  useFetcherToast(passwordFetcher, { loading: "正在验证账号…" });
  useFetcherToast(cookieFetcher, { loading: "正在验证 Cookie…" });
  useFetcherToast(checkFetcher, { loading: "正在检测会话…" });
  const admin = loaderData.user.role === "admin";
  const qr = (qrFetcher.data && "qr" in qrFetcher.data ? qrFetcher.data.qr : undefined) as { url: string; key: string } | undefined;
  const status = loaderData.credential;

  const notice = (fetcher: typeof qrFetcher, expectedIntent?: string) => {
    if (!fetcher.data || (expectedIntent && fetcher.data.intent !== expectedIntent)) return null;
    return fetcher.data.ok ? null : <Alert className="session-notice" type="error" showIcon title={fetcher.data.message} />;
  };

  const [method, setMethod] = useState("qr");
  const methods = [
    { key: "qr", title: "扫码登录", description: "使用 B 站 App 扫码获取会话", icon: <QrcodeOutlined />, badge: "推荐" },
    { key: "password", title: "账号密码", description: "一次性验证账号与密码", icon: <LockOutlined />, badge: "仅本机" },
    { key: "cookie", title: "手动 Cookie", description: "导入已有的账号会话", icon: <KeyOutlined />, badge: "仅本机" },
  ];
  const dateLabel = (value: string | null) => value ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : "—";

  return <div className="page redesigned-settings-page">
    <header className="settings-title"><h1>B站会话</h1><p>连接账号，为视频简介抓取提供有效会话。</p></header>
    <section className="connection-summary" aria-label="当前连接">
      <Avatar size={56} icon={<UserOutlined />} />
      <div className="connection-summary-account">
        <div className="connection-summary-name"><strong>{status.accountName ?? "尚未连接账号"}</strong><StatusBadge status={status.status === "valid" ? "success" : "warning"} label={status.status === "valid" ? "有效" : status.configured ? "需更新" : "未配置"} /></div>
        <div className="connection-summary-meta">
          <span>{status.accountMid ? `UID ${status.accountMid}` : "扫码后显示账号信息"}</span>
          <span>连接方式：{status.loginMethod ? methodLabels[status.loginMethod] ?? status.loginMethod : "—"}</span>
          <span>更新于 {dateLabel(status.updatedAt)}</span>
          <span>上次验证 {dateLabel(status.lastCheckedAt)}</span>
        </div>
      </div>
      {admin ? <checkFetcher.Form method="post"><ActionButton kind="secondary" htmlType="submit" name="intent" value="check" disabled={!status.configured} loading={checkFetcher.state !== "idle"}>检测会话</ActionButton></checkFetcher.Form> : null}
    </section>
    {notice(checkFetcher, "check")}
    <div className="settings-workspace">
      <aside className="settings-section-nav">
        <h2>更新连接</h2><p>选择一种方式获取或更新会话。</p>
        <nav aria-label="连接方式">
          {methods.map((item) => <button key={item.key} type="button" className={method === item.key ? "settings-nav-item is-active" : "settings-nav-item"} aria-pressed={method === item.key} aria-controls={`connection-${item.key}`} onClick={() => setMethod(item.key)}>
            <span className="settings-nav-icon">{item.icon}</span>
            <span className="settings-nav-copy"><span className="settings-nav-title">{item.title}<span className={item.key === "qr" ? "settings-method-tag recommended" : "settings-method-tag"}>{item.badge}</span></span><span className="settings-nav-description">{item.description}</span></span>
            <RightOutlined />
          </button>)}
        </nav>
      </aside>
      <div className="settings-active-surface">
        <section id="connection-qr" hidden={method !== "qr"} aria-label="扫码登录">
          <header className="settings-surface-title"><h2>扫码登录</h2><p>使用 B 站 App 扫描二维码，完成登录并建立会话。</p></header>
          <div className="connection-scan-layout">
            <div className="connection-qr-stage">
              <div className="connection-qr-frame">{qr ? <QRCode value={qr.url} size={220} /> : <QrcodeOutlined className="connection-qr-symbol" />}</div>
              {admin ? <qrFetcher.Form method="post">
                {qr ? <><input type="hidden" name="qrcodeKey" value={qr.key} /><input type="hidden" name="qrcodeUrl" value={qr.url} /></> : null}
                <ActionButton kind="primary" htmlType="submit" name="intent" value={qr ? "qr-poll" : "qr-start"} block loading={qrFetcher.state !== "idle"}>{qr ? "检查登录状态" : "生成二维码"}</ActionButton>
                {qr ? <ActionButton kind="tertiary" htmlType="submit" name="intent" value="qr-start" block disabled={qrFetcher.state !== "idle"}>重新生成</ActionButton> : null}
              </qrFetcher.Form> : <p className="settings-muted">仅管理员可连接账号。</p>}
            </div>
            <div className="connection-scan-guide"><h3>操作步骤</h3><ol>
              <li><span>1</span><div><strong>生成登录二维码</strong><p>点击「生成二维码」。</p></div></li>
              <li><span>2</span><div><strong>打开 B 站 App 扫一扫</strong><p>扫描二维码，在手机上确认登录。</p></div></li>
              <li><span>3</span><div><strong>检查登录状态</strong><p>确认后返回本页，点击「检查登录状态」。</p></div></li>
            </ol></div>
          </div>
          {notice(qrFetcher)}
        </section>
        <section id="connection-password" hidden={method !== "password"} aria-label="账号密码">
          <header className="settings-surface-title"><h2>账号密码</h2><p>密码仅用于本次登录，不会保存。</p></header>
          {!loaderData.localAccess ? <Alert type="warning" showIcon title="请在本机打开此页面，或改用扫码登录。" /> : null}
          {notice(passwordFetcher, "password")}
          <passwordFetcher.Form method="post" autoComplete="off" className="connection-entry-form">
            <label htmlFor="bili-username">手机号 / 邮箱 / 用户名</label>
            <Input id="bili-username" name="username" prefix={<UserOutlined />} disabled={!admin || !loaderData.localAccess} autoComplete="username" placeholder="输入 B 站账号" />
            <label htmlFor="bili-password">B 站密码</label>
            <Input.Password id="bili-password" name="password" prefix={<LockOutlined />} disabled={!admin || !loaderData.localAccess} autoComplete="current-password" placeholder="输入账号密码" />
            <div className="connection-form-actions"><ActionButton kind="primary" htmlType="submit" name="intent" value="password" disabled={!admin || !loaderData.localAccess} loading={passwordFetcher.state !== "idle"}>登录并连接</ActionButton></div>
          </passwordFetcher.Form>
          <p className="settings-muted">需要验证码或设备确认时，请使用扫码登录。</p>
        </section>
        <section id="connection-cookie" hidden={method !== "cookie"} aria-label="手动 Cookie">
          <header className="settings-surface-title"><h2>手动 Cookie</h2><p>导入已有会话，验证后加密保存。</p></header>
          {!loaderData.localAccess ? <Alert type="warning" showIcon title="Cookie 仅支持在本机录入，请在 localhost 打开。" /> : null}
          {notice(cookieFetcher, "manual")}
          <cookieFetcher.Form method="post" className="connection-entry-form">
            <label htmlFor="bili-cookie">B 站 Cookie</label>
            <Input.TextArea id="bili-cookie" name="cookie" rows={7} disabled={!admin || !loaderData.localAccess} placeholder="粘贴完整 Cookie" />
            <div className="connection-form-actions"><ActionButton kind="primary" htmlType="submit" name="intent" value="manual" disabled={!admin || !loaderData.localAccess} loading={cookieFetcher.state !== "idle"}>验证并保存</ActionButton></div>
          </cookieFetcher.Form>
        </section>
        <footer className="connection-security"><SafetyCertificateOutlined /><span>会话加密保存 · 账号密码不持久化</span></footer>
      </div>
    </div>
  </div>;
}
