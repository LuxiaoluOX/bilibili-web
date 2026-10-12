import { describe, expect, it } from "vitest";
import { LIBRARY_API_MAX_PAGE_SIZE, libraryRowsToCsv, parseLibraryApiRequest } from "../app/lib/library-api";

describe("public library API", () => {
  it("normalizes filters and bounds pagination", () => {
    const parsed = parseLibraryApiRequest(new URL("https://example.test/api/library?q=MK4&mode=operations&season=s11&page=-4&page_size=999&format=csv&download=1"));
    expect(parsed).toMatchObject({ format: "csv", download: true, page: 1, pageSize: LIBRARY_API_MAX_PAGE_SIZE, filters: { search: "MK4", gameMode: "operations", season: "S11" } });
  });

  it("drops invalid public filters", () => {
    const parsed = parseLibraryApiRequest(new URL(`https://example.test/api/library?mode=unknown&season=summer&creator=${"-".repeat(36)}`));
    expect(parsed.filters).toMatchObject({ gameMode: "", season: "", creatorId: "" });
  });

  it("accepts a structurally valid creator UUID", () => {
    const creatorId = "123e4567-e89b-12d3-a456-426614174000";
    expect(parseLibraryApiRequest(new URL(`https://example.test/api/library?creator=${creatorId}`)).filters.creatorId).toBe(creatorId);
  });

  it("writes UTF-8 CSV and neutralizes spreadsheet formulas", () => {
    const csv = libraryRowsToCsv([{ id: "1", weaponName: "=HYPERLINK(\"x\")", buildName: "方案", code: "6ABC", gameMode: "operations", creatorName: "作者", seasonCode: "S11", currentVersion: 1, sourcePublishedAt: null, sourceCount: 1 }]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"\'=HYPERLINK(""x"")"');
    expect(csv).toContain('"方案"');
  });
});
