import { isCodeGameMode, type CodeGameMode } from "./game-modes";

export const LIBRARY_API_SCHEMA_VERSION = "1.0";
export const LIBRARY_API_MAX_PAGE_SIZE = 100;

export type LibraryApiFilters = {
  search: string;
  gameMode: CodeGameMode | "";
  season: string;
  creatorId: string;
};

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function parseLibraryApiRequest(url: URL) {
  const requestedMode = url.searchParams.get("mode");
  const rawCreatorId = url.searchParams.get("creator")?.trim() ?? "";
  const format = url.searchParams.get("format") === "csv" ? "csv" as const : "json" as const;
  const rawPage = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  const rawPageSize = Number.parseInt(url.searchParams.get("page_size") ?? "50", 10);
  return {
    filters: {
      search: url.searchParams.get("q")?.trim().slice(0, 120) ?? "",
      gameMode: isCodeGameMode(requestedMode) ? requestedMode : "",
      season: /^S\d{1,3}$/i.test(url.searchParams.get("season")?.trim() ?? "") ? (url.searchParams.get("season")?.trim().toUpperCase() ?? "") : "",
      creatorId: isUuid(rawCreatorId) ? rawCreatorId : "",
    } satisfies LibraryApiFilters,
    format,
    download: url.searchParams.get("download") === "1",
    page: Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1,
    pageSize: Number.isFinite(rawPageSize) ? Math.min(LIBRARY_API_MAX_PAGE_SIZE, Math.max(1, rawPageSize)) : 50,
  };
}

function safeSpreadsheetValue(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvCell(value: unknown) {
  const text = safeSpreadsheetValue(value).replace(/"/g, '""');
  return `"${text}"`;
}

export type LibraryExportRow = {
  id: string;
  weaponName: string;
  buildName: string;
  code: string;
  gameMode: string;
  creatorName: string;
  seasonCode: string | null;
  currentVersion: number;
  sourcePublishedAt: string | null;
  sourceCount: number;
};

export function libraryRowsToCsv(rows: LibraryExportRow[]) {
  const headers = ["id", "weapon_name", "build_name", "code", "game_mode", "creator_name", "season_code", "current_version", "source_published_at", "source_count"];
  const body = rows.map((row) => [row.id, row.weaponName, row.buildName, row.code, row.gameMode, row.creatorName, row.seasonCode, row.currentVersion, row.sourcePublishedAt, row.sourceCount].map(csvCell).join(","));
  return `\uFEFF${[headers.map(csvCell).join(","), ...body].join("\r\n")}\r\n`;
}
