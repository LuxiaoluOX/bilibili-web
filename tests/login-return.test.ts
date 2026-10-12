import { describe, expect, it } from "vitest";
import { safeReturnTo } from "../app/routes/login";

describe("login return target", () => {
  it("rejects backslash-based external targets", () => {
    expect(safeReturnTo("/\\evil.example")).toBe("/");
  });

  it("keeps local paths", () => {
    expect(safeReturnTo("/builds?mode=operations")).toBe("/builds?mode=operations");
  });

  it("rejects control characters that normalize into external targets", () => {
    for (const character of ["\t", "\n", "\r"]) {
      expect(safeReturnTo(`/${character}/evil.example`, "https://app.example")).toBe("/");
    }
    expect(safeReturnTo("/path/..//evil.example", "https://app.example")).toBe("/");
  });
});
