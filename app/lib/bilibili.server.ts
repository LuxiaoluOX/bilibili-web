import { createHash } from "node:crypto";
import { env } from "./env.server";
import { getBilibiliCookie } from "./credentials.server";

const API = "https://api.bilibili.com";
const WWW = "https://www.bilibili.com";
let lastRequestAt = 0;
let wbiCache: { key: string; expiresAt: number } | null = null;
const MIXIN_KEY_ENC_TAB = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];

export class BilibiliError extends Error {
  constructor(message: string, public code?: number, public status?: number) {
    super(message);
  }
}

export function isBilibiliRiskControlError(error: unknown) {
  return error instanceof BilibiliError && (
    error.status === 412 || error.status === 429 || error.code === -352 || error.code === -412 || error.code === -429
  );
}

async function throttle() {
  const targetInterval = env.BILIBILI_REQUEST_INTERVAL_MS + Math.floor(Math.random() * (env.BILIBILI_REQUEST_JITTER_MS + 1));
  const wait = Math.max(0, targetInterval - (Date.now() - lastRequestAt));
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
}

async function requestHeaders() {
  const cookie = await getBilibiliCookie();
  return {
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0 Safari/537.36",
    referer: "https://www.bilibili.com/",
    "accept-language": "zh-CN,zh;q=0.9",
    ...(cookie ? { cookie } : {}),
  };
}

async function api<T>(path: string, allowedCodes: number[] = []): Promise<T> {
  await throttle();
  const response = await fetch(`${API}${path}`, {
    headers: await requestHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 429) throw new BilibiliError("B 站请求过于频繁", -429, 429);
  if (response.status === 412) throw new BilibiliError("B 站风控拦截了请求；会话可能仍然有效，系统会在冷却后重试", -412, 412);
  if (!response.ok) throw new BilibiliError(`B 站返回 HTTP ${response.status}`, undefined, response.status);
  const json = await response.json() as { code: number; message?: string; data: T };
  if (json.code !== 0 && !allowedCodes.includes(json.code)) throw new BilibiliError(json.message || "B 站接口请求失败", json.code, response.status);
  return json.data;
}

function basename(url: string) {
  return url.slice(url.lastIndexOf("/") + 1, url.lastIndexOf("."));
}

async function getWbiKey() {
  if (wbiCache && wbiCache.expiresAt > Date.now()) return wbiCache.key;
  const nav = await api<{ wbi_img: { img_url: string; sub_url: string } }>("/x/web-interface/nav", [-101]);
  const raw = basename(nav.wbi_img.img_url) + basename(nav.wbi_img.sub_url);
  const key = MIXIN_KEY_ENC_TAB.map((index) => raw[index]).join("").slice(0, 32);
  wbiCache = { key, expiresAt: Date.now() + 6 * 60 * 60 * 1000 };
  return key;
}

async function wbiApi<T>(path: string, params: Record<string, string | number>) {
  const key = await getWbiKey();
  const signed: Record<string, string> = { ...Object.fromEntries(Object.entries(params).map(([name, value]) => [name, String(value)])), wts: String(Math.floor(Date.now() / 1000)) };
  const query = Object.keys(signed).sort().map((name) => `${encodeURIComponent(name)}=${encodeURIComponent(signed[name].replace(/[!'()*]/g, ""))}`).join("&");
  const wRid = createHash("md5").update(query + key).digest("hex");
  return api<T>(`${path}?${query}&w_rid=${wRid}`);
}

export type BiliCreator = { mid: number; name: string; face?: string };
export type BiliVideo = { bvid: string; aid: number; title: string; pic?: string; description?: string; created?: number; length?: string };
export type BiliVideoPage = { videos: BiliVideo[]; page: number; pageSize: number; total: number };

function decodeHtml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

export function extractDescriptionFromVideoPage(html: string) {
  const stateMarker = "window.__INITIAL_STATE__=";
  const stateStart = html.indexOf(stateMarker);
  if (stateStart >= 0) {
    try {
      const jsonStart = stateStart + stateMarker.length;
      const ends = [html.indexOf(";</script>", jsonStart), html.indexOf(";(function", jsonStart)].filter((index) => index >= 0);
      const jsonEnd = ends.length ? Math.min(...ends) : -1;
      const state = JSON.parse(jsonEnd >= 0 ? html.slice(jsonStart, jsonEnd) : "") as { videoData?: { desc?: string }; videoInfo?: { desc?: string } };
      const description = state.videoData?.desc ?? state.videoInfo?.desc;
      if (description?.trim()) return description.trim();
    } catch {
      // Continue through the page metadata fallbacks.
    }
  }

  const jsonLdMatches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of jsonLdMatches) {
    try {
      const value = JSON.parse(match[1]) as { description?: string };
      if (value.description?.trim()) return decodeHtml(value.description.trim());
    } catch {
      // Ignore unrelated or malformed JSON-LD blocks.
    }
  }

  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!/(?:name|property)=["'](?:description|og:description)["']/i.test(tag)) continue;
    const content = tag.match(/content=["']([\s\S]*?)["']/i)?.[1];
    if (content?.trim()) return decodeHtml(content.trim());
  }
  return null;
}

export async function getVideoDescriptionFromPage(bvid: string) {
  await throttle();
  const response = await fetch(`${WWW}/video/${encodeURIComponent(bvid)}`, {
    headers: await requestHeaders(),
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 429) throw new BilibiliError("B 站页面请求过于频繁", -429, 429);
  if (response.status === 412) throw new BilibiliError("B 站页面风控拦截了请求", -412, 412);
  if (!response.ok) throw new BilibiliError(`B 站视频页面返回 HTTP ${response.status}`, undefined, response.status);
  const html = await response.text();
  if (/风控校验失败|访问异常|验证后继续/i.test(html)) throw new BilibiliError("B 站页面风控校验失败", -352, response.status);
  const description = extractDescriptionFromVideoPage(html);
  if (!description) throw new BilibiliError("视频页面中没有找到可读取的简介文本", -404, response.status);
  return description;
}

export async function getCreator(mid: string): Promise<BiliCreator> {
  const data = await api<{ card: { mid: string; name: string; face?: string } }>(`/x/web-interface/card?mid=${encodeURIComponent(mid)}`);
  return { mid: Number(data.card.mid), name: data.card.name, face: data.card.face };
}

export async function getCreatorVideosPage(mid: string, page = 1, pageSize = 30): Promise<BiliVideoPage> {
  if (!Number.isInteger(page) || page < 1) throw new Error("视频页码必须是正整数");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) throw new Error("每页视频数必须在 1–50 之间");
  const data = await wbiApi<{ list?: { vlist?: BiliVideo[] }; page?: { pn?: number; ps?: number; count?: number } }>("/x/space/wbi/arc/search", {
    mid, pn: page, ps: pageSize, order: "pubdate",
    dm_img_list: "[]",
    dm_img_str: "V2ViR0wgMS",
    dm_cover_img_str: "QU5HTEUgKEludGVsLCBBcHBsZSBNMSk",
    dm_img_inter: '{"ds":[],"wh":[0,0,0],"of":[0,0,0]}',
  });
  return {
    videos: data.list?.vlist ?? [],
    page: data.page?.pn ?? page,
    pageSize: data.page?.ps ?? pageSize,
    total: data.page?.count ?? 0,
  };
}

export async function getLatestVideos(mid: string): Promise<BiliVideo[]> {
  return (await getCreatorVideosPage(mid, 1, 30)).videos;
}

export async function getVideoDetail(bvid: string) {
  return api<{ aid: number; bvid: string; title: string; pic?: string; desc?: string; pubdate?: number }>(`/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`);
}
