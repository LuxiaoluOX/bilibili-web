import { ArrowLeftOutlined, CopyOutlined, ExportOutlined } from "@ant-design/icons";
import { App, Tag, Timeline, Typography } from "antd";
import { data, Link } from "react-router";
import type { Route } from "./+types/public-build";
import { ActionButton } from "../components/actions";
import { GAME_MODE_LABELS } from "../lib/game-modes";
import { getBuild, listGameSeasons } from "../lib/repository.server";
import { seasonDisplayName, seasonForDate } from "../lib/seasons";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData?.build ? `${loaderData.build.weaponName} · ${loaderData.build.buildName}` : "公开方案" }];
}

export function headers() {
  return { "Cache-Control": "public, max-age=60, s-maxage=300" };
}

export async function loader({ params }: Route.LoaderArgs) {
  const [build, seasons] = await Promise.all([getBuild(params.buildId), listGameSeasons()]);
  if (!build || build.gameMode === "unknown") throw data("方案不存在", { status: 404 });
  return {
    build: {
      id: build.id,
      creatorName: build.creatorName,
      weaponName: build.weaponName,
      buildName: build.buildName,
      currentVersion: build.currentVersion,
      gameMode: build.gameMode,
      sourcePublishedAt: build.sourcePublishedAt,
      versions: build.versions.map((version) => ({
        id: version.id,
        version: version.version,
        code: version.code,
        firstSeenAt: version.firstSeenAt,
        lastSeenAt: version.lastSeenAt,
        sourcePublishedAt: version.sourcePublishedAt,
        sourceUrls: version.sourceUrls.filter((url) => /^https:\/\/(?:www\.)?bilibili\.com\//i.test(url)),
      })),
    },
    seasons,
  };
}

export default function PublicBuild({ loaderData }: Route.ComponentProps) {
  const { message } = App.useApp();
  const { build, seasons } = loaderData;
  const current = build.versions.find((version) => version.version === build.currentVersion);
  const copyCode = async () => {
    if (!current) return;
    await navigator.clipboard.writeText(current.code);
    message.success("改枪码已复制");
  };

  return <main className="public-library-main public-build-detail">
    <Link className="public-back-link" to="/library"><ArrowLeftOutlined /> 返回公开码库</Link>
    <section className="public-build-hero">
      <div>
        <div className="public-build-tags"><Tag color="cyan">{GAME_MODE_LABELS[build.gameMode]}</Tag><Tag>v{build.currentVersion} 当前</Tag></div>
        <Typography.Title level={1}>{build.weaponName} · {build.buildName}</Typography.Title>
        <Typography.Paragraph>{build.creatorName} 发布并持续维护的已确认方案。</Typography.Paragraph>
      </div>
      <ActionButton kind="primary" icon={<CopyOutlined />} disabled={!current} onClick={copyCode}>复制当前改枪码</ActionButton>
    </section>
    <section className="public-current-code">
      <Typography.Text>当前改枪码</Typography.Text>
      <code>{current?.code ?? "—"}</code>
      <div><span>{current ? seasonDisplayName(seasonForDate(current.sourcePublishedAt, seasons) ?? { code: "—", name: "赛季未知", startsAt: "", endsAt: null }) : "赛季未知"}</span><span>{current?.sourcePublishedAt ? new Date(current.sourcePublishedAt).toLocaleDateString("zh-CN") : "发布时间未知"}</span></div>
    </section>
    <section className="public-version-history">
      <Typography.Title level={2}>版本与来源</Typography.Title>
      <Typography.Paragraph type="secondary">按最近确认时间排列；来源链接指向创作者公开发布的视频。</Typography.Paragraph>
      <Timeline items={build.versions.map((version) => {
        const season = seasonForDate(version.sourcePublishedAt, seasons);
        return {
          color: version.version === build.currentVersion ? "green" : "gray",
          children: <article className="public-version-item">
            <div><strong>v{version.version}{version.version === build.currentVersion ? " · 当前采用" : ""}</strong><span>{season ? seasonDisplayName(season) : "赛季未知"}</span></div>
            <code>{version.code}</code>
            <div className="public-version-sources">{version.sourceUrls.length ? version.sourceUrls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer"><ExportOutlined /> 视频来源 {index + 1}</a>) : <Typography.Text type="secondary">暂无公开来源链接</Typography.Text>}</div>
          </article>,
        };
      })} />
    </section>
  </main>;
}
