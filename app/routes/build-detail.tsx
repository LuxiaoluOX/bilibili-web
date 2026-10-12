import { ArrowLeftOutlined, CopyOutlined, ExportOutlined, HistoryOutlined, LinkOutlined, SwapOutlined } from "@ant-design/icons";
import { ProDescriptions } from "@ant-design/pro-components";
import { App, Empty, Space, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { data } from "react-router";
import type { Route } from "./+types/build-detail";
import { ActionButton, ActionGroup } from "../components/actions";
import {
  CodeValue,
  CountTag,
  DateCell,
  WorkbenchProTable,
  tablePagination,
} from "../components/data-display";
import { PageHeader, WorkbenchPanel } from "../components/layout";
import { requireUser } from "../lib/auth.server";
import { getBuild, listGameSeasons } from "../lib/repository.server";
import { GAME_MODE_LABELS } from "../lib/game-modes";
import { formatSeasonRange, seasonDisplayName, seasonForDate } from "../lib/seasons";
import { explainBuildVersions } from "../lib/version-explanation";

type BuildVersion = NonNullable<Awaited<ReturnType<typeof getBuild>>>["versions"][number];

export function meta({ loaderData }: Route.MetaArgs) {
  return [{
    title: loaderData?.build
      ? `${loaderData.build.weaponName} ${loaderData.build.buildName}`
      : "方案详情",
  }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireUser(request);
  const [build, seasons] = await Promise.all([
    getBuild(params.buildId),
    listGameSeasons(),
  ]);
  if (!build) throw data("方案不存在", { status: 404 });
  return { build, seasons, capturedAt: new Date().toISOString() };
}

export default function BuildDetail({ loaderData }: Route.ComponentProps) {
  const { message } = App.useApp();
  const { build, seasons } = loaderData;
  const current = build.versions.find((version) => version.version === build.currentVersion);
  const currentSeason = seasonForDate(loaderData.capturedAt, seasons);
  const effectiveSeason = seasonForDate(current?.sourcePublishedAt ?? null, seasons);
  const versionExplanations = explainBuildVersions(build.versions, build.currentVersion, seasons, loaderData.capturedAt);
  const carriedForward = versionExplanations.find((explanation) => explanation.isCurrent)?.carriedForward ?? false;
  const versionsById = new Map(build.versions.map((version) => [version.id, version]));

  const columns: ColumnsType<BuildVersion> = [
    {
      title: "版本",
      dataIndex: "version",
      fixed: "left",
      width: 110,
      align: "center",
      render: (version: number) => (
        <CountTag tone={version === build.currentVersion ? "green" : "default"}>
          v{version}{version === build.currentVersion ? " · 当前" : ""}
        </CountTag>
      ),
    },
    {
      title: "所属赛季",
      width: 190,
      align: "left",
      render: (_, version) => {
        const season = seasonForDate(version.sourcePublishedAt, seasons);
        return season ? (
          <span className="history-season-cell">
            <Space size={6} wrap>
              <CountTag tone="cyan">{season.code}</CountTag>
              <Typography.Text strong>{seasonDisplayName(season)}</Typography.Text>
            </Space>
            <Typography.Text type="secondary">{formatSeasonRange(season)}</Typography.Text>
          </span>
        ) : "—";
      },
    },
    {
      title: "改枪码",
      dataIndex: "code",
      width: 250,
      align: "left",
      render: (code: string) => <CodeValue value={code} />,
    },
    {
      title: "视频发布时间",
      dataIndex: "sourcePublishedAt",
      width: 180,
      align: "center",
      render: (value: string | null) => <DateCell value={value} empty="未知" />,
    },
    {
      title: "来源",
      dataIndex: "sourceUrls",
      fixed: "right",
      width: 140,
      align: "center",
      render: (sourceUrls: string[]) => sourceUrls.length ? (
        <ActionGroup compact>
          {sourceUrls.map((sourceUrl, index) => (
            <ActionButton
              key={sourceUrl}
              kind="link"
              scale="row"
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              icon={<ExportOutlined />}
            >
              来源 {index + 1}
            </ActionButton>
          ))}
        </ActionGroup>
      ) : "—",
    },
  ];

  const copyCurrentCode = async () => {
    if (!current?.code) return;
    await navigator.clipboard.writeText(current.code);
    message.success("当前改枪码已复制");
  };

  return (
    <div className="page build-history-page">
      <ActionButton kind="tertiary" scale="row" to="/builds" icon={<ArrowLeftOutlined />}>
        返回武器码字典
      </ActionButton>

      <PageHeader
        eyebrow="BUILD HISTORY"
        title={`${build.weaponName} · ${build.buildName}`}
        description={`${build.creatorName} 持续维护的${GAME_MODE_LABELS[build.gameMode]}版本记录；不同模式的改枪码独立归档。`}
        actions={(
          <ActionButton
            kind="secondary"
            icon={<CopyOutlined />}
            disabled={!current?.code}
            onClick={copyCurrentCode}
          >
            复制当前码
          </ActionButton>
        )}
      />

      <WorkbenchPanel
        className="build-current-panel"
        title={(
          <Space size={8} wrap>
            <span>当前采用</span>
            <CountTag tone="green">v{build.currentVersion}</CountTag>
            {effectiveSeason ? (
              <CountTag tone={carriedForward ? "amber" : "cyan"}>
                {effectiveSeason.code}{carriedForward ? " 沿用" : ""}
              </CountTag>
            ) : null}
          </Space>
        )}
        description={carriedForward && currentSeason && effectiveSeason
          ? `${seasonDisplayName(currentSeason)} 尚无新码，沿用 ${seasonDisplayName(effectiveSeason)} 最近确认版本`
          : "当前赛季最近确认的有效方案"}
      >
        <div className="build-current-content">
          <div className="build-current-code-block">
            <Typography.Text className="build-current-label" type="secondary">
              当前改枪码
            </Typography.Text>
            {current?.code ? <CodeValue value={current.code} /> : <Typography.Text>—</Typography.Text>}
          </div>
          <ProDescriptions
            className="build-current-descriptions"
            column={2}
            dataSource={{
              creator: build.creatorName,
              weapon: build.weaponName,
              gameMode: GAME_MODE_LABELS[build.gameMode],
              season: effectiveSeason
                ? `${seasonDisplayName(effectiveSeason)} · ${formatSeasonRange(effectiveSeason)}`
                : "未归属",
              published: current?.sourcePublishedAt ?? build.sourcePublishedAt,
            }}
            columns={[
              { title: "创作者", dataIndex: "creator" },
              { title: "武器", dataIndex: "weapon" },
              { title: "游戏模式", dataIndex: "gameMode" },
              { title: "所属赛季", dataIndex: "season" },
              {
                title: "视频发布时间",
                dataIndex: "published",
                render: (_, row) => <DateCell value={row.published} />,
              },
            ]}
          />
        </div>
      </WorkbenchPanel>

      <WorkbenchPanel
        className="build-explanation-panel"
        title={<Space><HistoryOutlined />版本变化说明</Space>}
        description="依据视频发布时间、版本代码和来源链生成；不推测来源中未说明的配装动机"
      >
        <div className="version-explanation-list">
          {versionExplanations.map((explanation) => {
            const version = versionsById.get(explanation.versionId);
            if (!version) return null;
            const season = seasonForDate(version.sourcePublishedAt, seasons);
            const primarySource = [...version.sources].sort((left, right) => new Date(right.publishedAt ?? right.firstSeenAt).getTime() - new Date(left.publishedAt ?? left.firstSeenAt).getTime())[0];
            const effectiveDate = new Date(explanation.effectiveAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
            return (
              <article className={`version-explanation-item${explanation.isCurrent ? " is-current" : ""}`} key={version.id}>
                <div className="version-explanation-marker"><span>v{version.version}</span></div>
                <div className="version-explanation-copy">
                  <div className="version-explanation-heading">
                    <Typography.Text strong>
                      {explanation.kind === "initial"
                        ? `${effectiveDate} 首次确认并建立版本`
                        : `${effectiveDate} 确认新码，替代 v${explanation.previousVersion}`}
                    </Typography.Text>
                    <Space size={6} wrap>
                      {season ? <CountTag tone="cyan">{season.code}</CountTag> : null}
                      {explanation.isCurrent ? <CountTag tone="green">当前采用</CountTag> : null}
                      {explanation.carriedForward ? <CountTag tone="amber">跨赛季沿用</CountTag> : null}
                    </Space>
                  </div>
                  <Typography.Paragraph className="version-explanation-reason">
                    {primarySource ? <>来源视频《{primarySource.title}》提供了该改枪码。</> : <>该版本保留了抓取时的首次发现记录，但来源视频信息不完整。</>}
                    {explanation.carriedForward && currentSeason && season ? ` ${seasonDisplayName(currentSeason)} 尚无更晚的已确认改枪码，因此继续沿用 ${seasonDisplayName(season)} 的最近版本。` : ""}
                    {!explanation.isCurrent && explanation.replacedByVersion ? ` 此后被更晚来源确认的 v${explanation.replacedByVersion} 替代。` : ""}
                    {explanation.isCurrent && !explanation.carriedForward ? " 这是当前已知发布时间最新的已确认版本。" : ""}
                  </Typography.Paragraph>
                  <div className="version-code-change">
                    {explanation.previousCode ? <><CodeValue value={explanation.previousCode} /><SwapOutlined aria-label="替换为" /></> : null}
                    <CodeValue value={version.code} />
                  </div>
                  {version.sources.length ? <div className="version-source-links"><LinkOutlined /><span>证据来源：</span>{version.sources.map((source, index) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.title || `来源 ${index + 1}`}<ExportOutlined /></a>)}</div> : null}
                </div>
              </article>
            );
          })}
        </div>
      </WorkbenchPanel>

      <WorkbenchPanel
        className="build-history-panel"
        title="版本记录"
        description={`${build.versions.length} 个历史版本；最新确认版本优先展示`}
      >
        <WorkbenchProTable<BuildVersion>
          preferenceKey="build-version-history"
          rowKey="id"
          columns={columns}
          dataSource={build.versions}
          options={false}
          scroll={{ x: 870 }}
          pagination={tablePagination(10, "个版本")}
          rowClassName={(version) => version.version === build.currentVersion ? "history-current-row" : ""}
          locale={{ emptyText: <Empty description="暂无历史版本" /> }}
        />
      </WorkbenchPanel>
    </div>
  );
}
