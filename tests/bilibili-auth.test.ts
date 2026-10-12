import { describe, expect, it } from "vitest";
import { cookieHeaderFromSetCookie, isLoopbackHost, isTrustedLocalRequest } from "../app/lib/bilibili-auth.server";

describe("B 站会话安全边界", () => {
  it("只提取 Set-Cookie 的会话键值，不保留属性", () => {
    expect(cookieHeaderFromSetCookie([
      "SESSDATA=secret; Path=/; HttpOnly; Secure",
      "bili_jct=csrf; Path=/; Secure",
    ])).toBe("SESSDATA=secret; bili_jct=csrf");
  });

  it("账号密码与 Cookie 录入仅允许本机地址", () => {
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("192.168.4.126")).toBe(false);
  });

  it("不使用可伪造的 Host 请求头判断本机访问", () => {
    expect(isTrustedLocalRequest(new Request("http://localhost/bilibili-session", {
      headers: { "x-sjz-client-ip": "192.168.4.126" },
    }), "127.0.0.1")).toBe(false);
    expect(isTrustedLocalRequest(new Request("https://sjz.example/bilibili-session", {
      headers: { "x-sjz-client-ip": "127.0.0.1" },
    }), "127.0.0.1")).toBe(true);
    expect(isTrustedLocalRequest(new Request("http://localhost/bilibili-session", {
      headers: { "x-sjz-client-ip": "127.0.0.1" },
    }), "0.0.0.0")).toBe(false);
  });

  it("开发服务器根据可信客户端地址区分本机和局域网", () => {
    expect(isTrustedLocalRequest(new Request("http://localhost:8088/bilibili-session", {
      headers: { "x-sjz-client-ip": "127.0.0.1" },
    }), "", "development")).toBe(true);
    expect(isTrustedLocalRequest(new Request("http://192.168.4.10:8088/bilibili-session", {
      headers: { "x-sjz-client-ip": "192.168.4.20" },
    }), "", "development")).toBe(false);
  });
});
