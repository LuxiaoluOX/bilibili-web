import { describe, expect, it } from "vitest";
import { sanitizePostgresText } from "../app/lib/crawler.server";

describe("crawler ingestion boundaries", () => {
  it("removes PostgreSQL-incompatible NUL bytes from external text", () => {
    expect(sanitizePostgresText("简介前缀\u0000改枪码后缀")).toBe("简介前缀改枪码后缀");
  });

  it("preserves ordinary Chinese text and line breaks", () => {
    const value = "K437 突击步枪\n方案码：6KURTQC07FI7MVPVB9B3H";
    expect(sanitizePostgresText(value)).toBe(value);
  });
});
