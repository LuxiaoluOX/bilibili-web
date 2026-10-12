export type Role = "admin" | "operator" | "viewer";

export type CreatorSchedule = {
  mode: "inherit" | "override";
  cronExpression: string | null;
  timezone: "Asia/Shanghai";
  nextRunAt: string | null;
};

export type CrawlRunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "partially_succeeded"
  | "failed"
  | "cancelled";

export type SourceType = "video_description" | "root_comment" | "manual_import";
export type IngestionMethod = "api" | "page" | "manual";
export type CandidateStatus = "accepted" | "pending" | "rejected" | "ignored";
export type WeaponAttributionStatus = "resolved" | "provisional" | "unresolved";
export type ReviewDecision = "accept" | "reject" | "correct";
export type { GameMode } from "./game-modes";

export type WeaponBuild = {
  id: string;
  creatorId: string;
  creatorName: string;
  weaponName: string;
  buildName: string;
  currentCode: string;
  currentVersion: number;
  updatedAt: string;
};

export type WeaponBuildVersion = {
  id: string;
  buildId: string;
  version: number;
  code: string;
  firstSeenAt: string;
  lastSeenAt: string;
  sourceUrl: string;
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: "管理员",
  operator: "运营",
  viewer: "只读",
};

export function canOperate(role: Role) {
  return role === "admin" || role === "operator";
}

export function canAdmin(role: Role) {
  return role === "admin";
}
