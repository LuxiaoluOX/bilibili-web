import { KeyOutlined, LockOutlined, QrcodeOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { ProCard, ProDescriptions } from "@ant-design/pro-components";
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

  return <div className="page session-page">
    <PageHeader eyebrow="SECURE CONNECTION" title="B站会话" description="集中获取、验证和更新抓取所需会话；不读取浏览器 Cookie，不持久化账号密码。" />
    <ProCard className="session-status-card" variant="outlined" title={<Space><SafetyCertificateOutlined />当前连接</Space>} extra={<StatusBadge status={status.status === "valid" ? "success" : "warning"} label={status.status === "valid" ? "有效" : status.configured ? "需更新" : "未配置"} />}>
      <ProDescriptions column={{ xs: 1, sm: 2, md: 4 }} dataSource={{account:status.accountName ? `${status.accountName} · UID ${status.accountMid}` : "—",method:status.loginMethod ? methodLabels[status.loginMethod] ?? status.loginMethod : "—",updated:status.updatedAt ? new Date(status.updatedAt).toLocaleString("zh-CN") : "—",checked:status.lastCheckedAt ? new Date(status.lastCheckedAt).toLocaleString("zh-CN") : "—"}} columns={[{title:"账号",dataIndex:"account"},{title:"获取方式",dataIndex:"method"},{title:"更新时间",dataIndex:"updated"},{title:"上次验证",dataIndex:"checked"}]} />
      {admin ? <checkFetcher.Form method="post"><ActionButton kind="secondary" htmlType="submit" name="intent" value="check" loading={checkFetcher.state !== "idle"}>检测当前会话</ActionButton></checkFetcher.Form> : null}
      {notice(checkFetcher, "check")}
    </ProCard>

    <ProCard className="session-method-card" variant="outlined">
      <Tabs items={[
        { key: "qr", label: <Space><QrcodeOutlined />扫码登录</Space>, children: <div className="session-method-panel">
          <Alert type="info" showIcon title="推荐方式" description="不需要向本系统提供账号密码；二维码过期后可重新生成。" />
          {notice(qrFetcher)}
          {qr ? <div className="qr-login-box"><QRCode value={qr.url} size={220} /><Typography.Text type="secondary">使用 B 站 App 扫码并在手机上确认</Typography.Text><qrFetcher.Form method="post"><input type="hidden" name="qrcodeKey" value={qr.key} /><input type="hidden" name="qrcodeUrl" value={qr.url} /><ActionButton kind="primary" htmlType="submit" name="intent" value="qr-poll" loading={qrFetcher.state !== "idle"}>我已扫码，检查状态</ActionButton></qrFetcher.Form></div> : <qrFetcher.Form method="post"><ActionButton kind="primary" htmlType="submit" name="intent" value="qr-start" icon={<QrcodeOutlined />} loading={qrFetcher.state !== "idle"}>生成登录二维码</ActionButton></qrFetcher.Form>}
        </div> },
        { key: "password", label: <Space><LockOutlined />账号密码</Space>, children: <div className="session-method-panel">
          <Alert type={loaderData.localAccess ? "warning" : "error"} showIcon title={loaderData.localAccess ? "仅用于本次登录，账号密码不会写入数据库、日志或审计记录" : "当前通过局域网地址访问，为避免明文传输，账号密码登录已禁用"} description="若 B 站要求验证码、短信或设备确认，请改用扫码登录。任何方式都不能保证绕过平台风控。" />
          {notice(passwordFetcher, "password")}
          <passwordFetcher.Form method="post" autoComplete="off" className="session-form">
            <Typography.Text className="field-label">手机号 / 邮箱 / 用户名</Typography.Text>
            <Input name="username" prefix={<KeyOutlined />} disabled={!admin || !loaderData.localAccess} autoComplete="username" />
            <Typography.Text className="field-label">B 站密码</Typography.Text>
            <Input.Password name="password" prefix={<LockOutlined />} disabled={!admin || !loaderData.localAccess} autoComplete="current-password" />
            <ActionButton className="modal-submit" kind="primary" htmlType="submit" name="intent" value="password" disabled={!admin || !loaderData.localAccess} loading={passwordFetcher.state !== "idle"}>一次性登录并保存会话</ActionButton>
          </passwordFetcher.Form>
        </div> },
        { key: "cookie", label: <Space><KeyOutlined />手动 Cookie</Space>, children: <div className="session-method-panel">
          <Alert type={loaderData.localAccess ? "info" : "error"} showIcon title={loaderData.localAccess ? "Cookie 验证成功后使用 AES-256-GCM 加密保存，之后不再回显" : "当前通过局域网地址访问，Cookie 输入已禁用；请在本机 localhost 打开此页面"} />
          {notice(cookieFetcher, "manual")}
          <cookieFetcher.Form method="post" className="session-form">
            <Typography.Text className="field-label">B 站 Cookie</Typography.Text>
            <Input.TextArea name="cookie" rows={7} disabled={!admin || !loaderData.localAccess} placeholder="仅在本机粘贴 Cookie" />
            <ActionButton className="modal-submit" kind="primary" htmlType="submit" name="intent" value="manual" disabled={!admin || !loaderData.localAccess} loading={cookieFetcher.state !== "idle"}>验证并加密保存</ActionButton>
          </cookieFetcher.Form>
        </div> },
      ]} />
    </ProCard>
  </div>;
}
