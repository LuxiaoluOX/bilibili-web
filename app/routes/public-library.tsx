import { ApiOutlined, CopyOutlined, DownloadOutlined, SearchOutlined } from "@ant-design/icons";
import { App, Empty, Input, Space, Tag, Typography } from "antd";
import { Form, Link } from "react-router";
import type { Route } from "./+types/public-library";
import { ActionButton } from "../components/actions";
import { GAME_MODE_LABELS, CODE_GAME_MODE_OPTIONS, isCodeGameMode } from "../lib/game-modes";
import { listPublicBuilds, listPublicCreators } from "../lib/public-library.server";
import { listGameSeasons } from "../lib/repository.server";
import { isUuid } from "../lib/library-api";

export function meta() {
  return [
    { title: "公开改枪码库 · 三角洲行动" },
    { name: "description", content: "按武器、模式、赛季和创作者查询可追溯的三角洲行动改枪码。" },
  ];
}

export function headers() {
  return { "Cache-Control": "public, max-age=60, s-maxage=300" };
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const search = url.searchParams.get("q")?.trim() ?? "";
  const requestedMode = url.searchParams.get("mode");
  const gameMode = isCodeGameMode(requestedMode) ? requestedMode : "";
  const season = url.searchParams.get("season")?.trim() ?? "";
  const rawCreatorId = url.searchParams.get("creator")?.trim() ?? "";
  const creatorId = isUuid(rawCreatorId) ? rawCreatorId : "";
  const [builds, creators, seasons] = await Promise.all([
    listPublicBuilds({ search, gameMode, season, creatorId }),
    listPublicCreators(),
    listGameSeasons(),
  ]);
  return { builds, creators, seasons, filters: { search, gameMode, season, creatorId } };
}

export default function PublicLibrary({ loaderData }: Route.ComponentProps) {
  const { message } = App.useApp();
  const apiParams = new URLSearchParams();
  if (loaderData.filters.search) apiParams.set("q", loaderData.filters.search);
  if (loaderData.filters.gameMode) apiParams.set("mode", loaderData.filters.gameMode);
  if (loaderData.filters.season) apiParams.set("season", loaderData.filters.season);
  if (loaderData.filters.creatorId) apiParams.set("creator", loaderData.filters.creatorId);
  const apiHref = `/api/library${apiParams.size ? `?${apiParams}` : ""}`;
  const exportHref = (format: "csv" | "json") => {
    const params = new URLSearchParams(apiParams);
    params.set("format", format);
    params.set("download", "1");
    return `/api/library?${params}`;
  };
  const copyCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    message.success("改枪码已复制");
  };

  return <main className="public-library-main">
    <section className="public-library-hero">
      <Typography.Text className="eyebrow">PUBLIC BUILD LIBRARY</Typography.Text>
      <Typography.Title level={1}>找到当前可用、来源清楚的改枪方案</Typography.Title>
      <Typography.Paragraph>按武器、模式、赛季或创作者筛选；每个方案只展示已确认的当前版本，并保留原始视频来源。</Typography.Paragraph>
      <Form method="get" className="public-library-search" role="search">
        <Input name="q" defaultValue={loaderData.filters.search} prefix={<SearchOutlined />} placeholder="搜索武器、方案名、创作者或改枪码" allowClear />
        <select className="native-select" name="mode" defaultValue={loaderData.filters.gameMode}><option value="">全部模式</option>{CODE_GAME_MODE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
        <select className="native-select" name="season" defaultValue={loaderData.filters.season}><option value="">全部赛季</option>{loaderData.seasons.map((season) => <option key={season.code} value={season.code}>{season.code} {season.name}</option>)}</select>
        <select className="native-select" name="creator" defaultValue={loaderData.filters.creatorId}><option value="">全部创作者</option>{loaderData.creators.map((creator) => <option key={creator.id} value={creator.id}>{creator.name}</option>)}</select>
        <ActionButton kind="primary" htmlType="submit">查询</ActionButton>
        <ActionButton kind="tertiary" to="/library">重置</ActionButton>
      </Form>
    </section>

    <section className="public-library-results" aria-labelledby="library-results-title">
      <div className="public-library-results-heading">
        <div><Typography.Title id="library-results-title" level={2}>公开方案</Typography.Title><Typography.Text type="secondary">共 {loaderData.builds.length} 个当前有效方案</Typography.Text></div>
        <Space className="public-library-export-actions" wrap>
          <ActionButton kind="secondary" scale="row" href={exportHref("csv")} icon={<DownloadOutlined />}>导出 CSV</ActionButton>
          <ActionButton kind="secondary" scale="row" href={exportHref("json")} icon={<DownloadOutlined />}>导出 JSON</ActionButton>
          <ActionButton kind="tertiary" scale="row" href={apiHref} target="_blank" rel="noreferrer" icon={<ApiOutlined />}>只读 API</ActionButton>
        </Space>
      </div>
      <div className="public-api-strip"><ApiOutlined /><div><strong>公开只读 API</strong><span>GET <code>/api/library</code> · 支持 q、mode、season、creator、page、page_size；当前筛选会同步到导出文件。</span></div></div>
      {loaderData.builds.length ? <div className="public-build-grid">
        {loaderData.builds.map((build) => <article className="public-build-card" key={build.id}>
          <div className="public-build-card-top">
            <div><Typography.Text type="secondary">{build.creatorName}</Typography.Text><Typography.Title level={3}>{build.weaponName}</Typography.Title></div>
            <Tag color="cyan">{GAME_MODE_LABELS[build.gameMode]}</Tag>
          </div>
          <Typography.Text className="public-build-name">{build.buildName}</Typography.Text>
          <div className="public-code-block"><code>{build.code}</code></div>
          <div className="public-build-meta">
            <span>{build.seasonCode ?? "赛季未知"}</span><span>v{build.currentVersion}</span><span>{build.sourceCount} 个来源</span>
          </div>
          <div className="public-build-actions">
            <ActionButton kind="primary" icon={<CopyOutlined />} onClick={() => copyCode(build.code)}>复制改枪码</ActionButton>
            <Link to={`/library/${build.id}`} prefetch="intent">查看来源与历史</Link>
          </div>
        </article>)}
      </div> : <div className="public-library-empty"><Empty description="没有符合条件的公开方案" /></div>}
    </section>
  </main>;
}
