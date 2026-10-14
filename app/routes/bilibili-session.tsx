import { KeyOutlined, LockOutlined, QrcodeOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { Alert, Input, QRCode, Space, Tabs, Typography } from "antd";
import { data, useFetcher } from "react-router";
import type { Route } from "./+types/bilibili-session";
import { ActionButton } from "../components/actions";
import { StatusBadge } from "../components/data-display";
import { useFetcherToast } from "../components/feedback";
import { PageHeader } from "../components/layout";
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

  return <div className="page session-page preferences-page">
    <PageHeader eyebrow="ACCOUNT CONNECTION" title="B站会话" description="连接账号，为视频简介抓取提供有效会话。" />
    <div className="preferences-layout session-connection-layout">
      <section className="preferences-panel session-connect-panel">
        <div className="preferences-panel-heading">
          <span className="preferences-icon"><QrcodeOutlined /></span>
          <div><h2>连接 B 站账号</h2><p>选择一种方式获取或更新会话。</p></div>
        </div>
        <Tabs className="session-connect-tabs" items={[
          { key: "qr", label: <Space><QrcodeOutlined />扫码登录</Space>, children: <div className="session-method-panel session-qr-panel">
            <div className="session-qr-visual">
              {qr ? <QRCode value={qr.url} size={208} /> : <div className="session-qr-empty"><QrcodeOutlined /><span>生成二维码后扫码连接</span></div>}
            </div>
            <div className="session-qr-instructions">
              <span className="session-recommended">推荐方式</span>
              <h3>用 B 站 App 扫码</h3>
              <p>无需提供账号密码，手机确认即可连接。</p>
              <ol><li>生成登录二维码</li><li>打开 B 站 App 扫一扫</li><li>手机确认后检查登录状态</li></ol>
              {notice(qrFetcher)}
              {admin ? qr ? <qrFetcher.Form method="post">
                <input type="hidden" name="qrcodeKey" value={qr.key} />
                <input type="hidden" name="qrcodeUrl" value={qr.url} />
                <ActionButton kind="primary" htmlType="submit" name="intent" value="qr-poll" loading={qrFetcher.state !== "idle"}>检查登录状态</ActionButton>
                <ActionButton kind="tertiary" htmlType="submit" name="intent" value="qr-start" loading={qrFetcher.state !== "idle"}>重新生成</ActionButton>
              </qrFetcher.Form> : <qrFetcher.Form method="post"><ActionButton kind="primary" htmlType="submit" name="intent" value="qr-start" loading={qrFetcher.state !== "idle"}>生成二维码</ActionButton></qrFetcher.Form> : <p className="preferences-helper">仅管理员可连接账号。</p>}
            </div>
          </div> },
          { key: "password", label: <Space><LockOutlined />账号密码</Space>, children: <div className="session-method-panel">
            <div className="session-form-heading"><h3>一次性账号登录</h3><p>密码仅用于本次登录，不会保存。</p></div>
            {!loaderData.localAccess ? <Alert type="warning" showIcon title="请在本机打开此页面，或改用扫码登录。" /> : null}
            {notice(passwordFetcher, "password")}
            <passwordFetcher.Form method="post" autoComplete="off" className="session-form">
              <label className="field-label" htmlFor="bili-username">手机号 / 邮箱 / 用户名</label>
              <Input id="bili-username" name="username" prefix={<KeyOutlined />} disabled={!admin || !loaderData.localAccess} autoComplete="username" placeholder="输入 B 站账号" />
              <label className="field-label" htmlFor="bili-password">B 站密码</label>
              <Input.Password id="bili-password" name="password" prefix={<LockOutlined />} disabled={!admin || !loaderData.localAccess} autoComplete="current-password" placeholder="输入账号密码" />
              <ActionButton className="modal-submit" kind="primary" htmlType="submit" name="intent" value="password" disabled={!admin || !loaderData.localAccess} loading={passwordFetcher.state !== "idle"}>登录并连接</ActionButton>
            </passwordFetcher.Form>
            <p className="preferences-helper">需要验证码或设备确认时，请使用扫码登录。</p>
          </div> },
          { key: "cookie", label: <Space><KeyOutlined />手动 Cookie</Space>, children: <div className="session-method-panel">
            <div className="session-form-heading"><h3>导入已有会话</h3><p>验证后加密保存，不会回显 Cookie。</p></div>
            {!loaderData.localAccess ? <Alert type="warning" showIcon title="Cookie 仅支持在本机录入，请在 localhost 打开。" /> : null}
            {notice(cookieFetcher, "manual")}
            <cookieFetcher.Form method="post" className="session-form">
              <label className="field-label" htmlFor="bili-cookie">B 站 Cookie</label>
              <Input.TextArea id="bili-cookie" name="cookie" rows={6} disabled={!admin || !loaderData.localAccess} placeholder="粘贴完整 Cookie" />
              <ActionButton className="modal-submit" kind="primary" htmlType="submit" name="intent" value="manual" disabled={!admin || !loaderData.localAccess} loading={cookieFetcher.state !== "idle"}>验证并保存</ActionButton>
            </cookieFetcher.Form>
          </div> },
        ]} />
        <div className="session-security-footer"><SafetyCertificateOutlined /><span>会话加密保存 · 账号密码不持久化</span></div>
      </section>
      <aside className="preferences-aside">
        <section className="preferences-panel session-account-panel">
          <div className="preferences-panel-heading"><h2>当前连接</h2><StatusBadge status={status.status === "valid" ? "success" : "warning"} label={status.status === "valid" ? "有效" : status.configured ? "需更新" : "未配置"} /></div>
          <div className="preferences-panel-body">
            <div className="session-account"><span className="preferences-icon"><SafetyCertificateOutlined /></span><div><strong>{status.accountName ?? "尚未连接账号"}</strong><span>{status.accountMid ? `UID ${status.accountMid}` : "连接后显示账号信息"}</span></div></div>
            <dl className="preferences-details">
              <div><dt>连接方式</dt><dd>{status.loginMethod ? methodLabels[status.loginMethod] ?? status.loginMethod : "—"}</dd></div>
              <div><dt>更新时间</dt><dd>{status.updatedAt ? new Date(status.updatedAt).toLocaleString("zh-CN") : "—"}</dd></div>
              <div><dt>上次验证</dt><dd>{status.lastCheckedAt ? new Date(status.lastCheckedAt).toLocaleString("zh-CN") : "—"}</dd></div>
            </dl>
            {admin ? <checkFetcher.Form method="post"><ActionButton kind="secondary" htmlType="submit" name="intent" value="check" block disabled={!status.configured} loading={checkFetcher.state !== "idle"}>检测当前会话</ActionButton></checkFetcher.Form> : null}
            {notice(checkFetcher, "check")}
          </div>
        </section>
        <section className="preferences-note"><h3>会话失效怎么办？</h3><p>重新扫码即可更新连接。平台要求验证时，请在 B 站 App 中完成确认。</p></section>
      </aside>
    </div>
  </div>;
}
