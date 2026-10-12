import { constants, publicEncrypt } from "node:crypto";
import { getLoginClientAddress } from "./login-rate-limit";

const PASSPORT = "https://passport.bilibili.com";
const NAV = "https://api.bilibili.com/x/web-interface/nav";

const browserHeaders = {
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0 Safari/537.36",
  referer: "https://www.bilibili.com/",
  "accept-language": "zh-CN,zh;q=0.9",
};

type ApiEnvelope<T> = { code: number; message?: string; data?: T };

export class BilibiliLoginError extends Error {
  constructor(message: string, public reason: "invalid" | "verification" | "expired" | "upstream" = "upstream") {
    super(message);
  }
}

export function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

export function isTrustedLocalRequest(
  request: Request,
  serverHost = process.env.HOST ?? "",
  environment = process.env.NODE_ENV,
) {
  const clientAddress = getLoginClientAddress(request);
  if (environment === "development") return clientAddress !== null && isLoopbackHost(clientAddress);
  if (!isLoopbackHost(serverHost)) return false;
  return clientAddress === null || isLoopbackHost(clientAddress);
}

export function cookieHeaderFromSetCookie(values: string[]) {
  return values.map((value) => value.split(";", 1)[0]?.trim()).filter(Boolean).join("; ");
}

function responseCookies(response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.() ?? [];
  if (values.length) return cookieHeaderFromSetCookie(values);
  const combined = response.headers.get("set-cookie");
  return combined ? cookieHeaderFromSetCookie(combined.split(/,(?=[^;,]+=)/)) : "";
}

async function jsonRequest<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new BilibiliLoginError(`B 站登录服务返回 HTTP ${response.status}`);
  const payload = await response.json() as ApiEnvelope<T>;
  if (payload.code !== 0 || !payload.data) throw new BilibiliLoginError(payload.message || "B 站登录服务请求失败");
  return { response, data: payload.data };
}

export async function validateBilibiliSession(cookie: string) {
  const response = await fetch(NAV, {
    headers: { ...browserHeaders, cookie },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new BilibiliLoginError(`B 站会话校验返回 HTTP ${response.status}`);
  const payload = await response.json() as ApiEnvelope<{ isLogin?: boolean; mid?: number; uname?: string }>;
  if (payload.code !== 0 || !payload.data?.isLogin || !payload.data.mid) throw new BilibiliLoginError("会话无效或已过期", "invalid");
  return { mid: String(payload.data.mid), name: payload.data.uname || `UID ${payload.data.mid}` };
}

export async function generateQrLogin() {
  const { data } = await jsonRequest<{ url: string; qrcode_key: string }>(`${PASSPORT}/x/passport-login/web/qrcode/generate`, {
    headers: browserHeaders,
  });
  return { url: data.url, key: data.qrcode_key };
}

export async function pollQrLogin(key: string) {
  const { response, data } = await jsonRequest<{ code: number; message?: string }>(
    `${PASSPORT}/x/passport-login/web/qrcode/poll?qrcode_key=${encodeURIComponent(key)}`,
    { headers: browserHeaders },
  );
  if (data.code === 86101) return { state: "waiting" as const, message: "等待扫码" };
  if (data.code === 86090) return { state: "confirmed" as const, message: "已扫码，请在手机上确认" };
  if (data.code === 86038) throw new BilibiliLoginError("二维码已过期，请重新生成", "expired");
  if (data.code !== 0) throw new BilibiliLoginError(data.message || "扫码登录失败", "verification");
  const cookie = responseCookies(response);
  if (!cookie) throw new BilibiliLoginError("扫码已确认，但没有收到会话 Cookie");
  return { state: "succeeded" as const, cookie };
}

export async function loginWithPassword(username: string, password: string) {
  const { data: keyData } = await jsonRequest<{ hash: string; key: string }>(`${PASSPORT}/x/passport-login/web/key`, {
    headers: browserHeaders,
  });
  const encryptedPassword = publicEncrypt(
    { key: keyData.key, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(keyData.hash + password),
  ).toString("base64");
  const body = new URLSearchParams({
    source: "main_web",
    username,
    password: encryptedPassword,
    keep: "true",
    token: "",
    challenge: "",
    validate: "",
    seccode: "",
  });
  const response = await fetch(`${PASSPORT}/x/passport-login/web/login`, {
    method: "POST",
    headers: { ...browserHeaders, "content-type": "application/x-www-form-urlencoded" },
    body,
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new BilibiliLoginError(`B 站密码登录返回 HTTP ${response.status}`);
  const payload = await response.json() as ApiEnvelope<{ status?: number; message?: string }>;
  if (payload.code !== 0) {
    const verification = payload.code === -105 || /验证码|短信|验证|风控/.test(payload.message ?? "");
    throw new BilibiliLoginError(payload.message || "账号密码登录失败", verification ? "verification" : "invalid");
  }
  if (payload.data?.status && payload.data.status !== 0) {
    throw new BilibiliLoginError(payload.data.message || "需要完成验证码、短信或设备验证", "verification");
  }
  const cookie = responseCookies(response);
  if (!cookie) throw new BilibiliLoginError("登录接口没有返回会话，请改用扫码登录", "verification");
  return cookie;
}
