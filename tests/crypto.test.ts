import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "../app/lib/crypto.server";

describe("凭据加密", () => {
  it("使用随机 IV 加密并可正确解密", () => {
    const value = "SESSDATA=private-cookie";
    const first = encryptSecret(value);
    const second = encryptSecret(value);
    expect(first).not.toBe(second);
    expect(decryptSecret(first)).toBe(value);
  });

  it("拒绝被篡改的密文", () => {
    const encrypted = encryptSecret("secret");
    expect(() => decryptSecret(`${encrypted}broken`)).toThrow();
  });
});
