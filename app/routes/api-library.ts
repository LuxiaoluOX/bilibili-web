import type { Route } from "./+types/api-library";
import { LIBRARY_API_SCHEMA_VERSION, libraryRowsToCsv, parseLibraryApiRequest } from "../lib/library-api";
import { listPublicBuilds } from "../lib/public-library.server";

const publicHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=60, s-maxage=300",
  "X-Content-Type-Options": "nosniff",
};

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { filters, format, download, page, pageSize } = parseLibraryApiRequest(url);
  const builds = await listPublicBuilds(filters);
  const total = builds.length;
  const start = (page - 1) * pageSize;
  const rows = download ? builds : builds.slice(start, start + pageSize);
  const responsePage = download ? 1 : page;
  const responsePageSize = download ? total : pageSize;
  const filenameDate = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    return new Response(libraryRowsToCsv(rows), {
      headers: {
        ...publicHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        ...(download ? { "Content-Disposition": `attachment; filename="delta-force-library-${filenameDate}.csv"` } : {}),
      },
    });
  }

  return Response.json({
    schemaVersion: LIBRARY_API_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    filters: {
      q: filters.search || null,
      mode: filters.gameMode || null,
      season: filters.season || null,
      creator: filters.creatorId || null,
    },
    pagination: {
      page: responsePage,
      pageSize: responsePageSize,
      total,
      totalPages: download ? (total ? 1 : 0) : Math.ceil(total / pageSize),
    },
    data: rows.map((build) => ({
      id: build.id,
      weaponName: build.weaponName,
      buildName: build.buildName,
      code: build.code,
      gameMode: build.gameMode,
      creatorName: build.creatorName,
      seasonCode: build.seasonCode,
      currentVersion: build.currentVersion,
      sourcePublishedAt: build.sourcePublishedAt,
      sourceCount: build.sourceCount,
      detailPath: `/library/${build.id}`,
    })),
  }, {
    headers: {
      ...publicHeaders,
      ...(download ? { "Content-Disposition": `attachment; filename="delta-force-library-${filenameDate}.json"` } : {}),
    },
  });
}
