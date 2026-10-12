import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  route("api/library", "routes/api-library.ts"),
  layout("routes/public-layout.tsx", [
    route("library", "routes/public-library.tsx"),
    route("library/:buildId", "routes/public-build.tsx"),
  ]),
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.ts"),
  route("health", "routes/health.ts"),
  layout("routes/app-layout.tsx", [
    index("routes/dashboard.tsx"),
    route("creators", "routes/creators.tsx"),
    route("builds", "routes/builds.tsx"),
    route("builds/:buildId", "routes/build-detail.tsx"),
    route("reviews", "routes/reviews.tsx"),
    route("runs", "routes/runs.tsx"),
    route("quality", "routes/quality.tsx"),
    route("bilibili-session", "routes/bilibili-session.tsx"),
    route("settings", "routes/settings.tsx"),
    route("season-sync", "routes/season-sync.tsx"),
    route("users", "routes/users.tsx"),
    route("audit", "routes/audit.tsx"),
    route("design-system", "routes/design-system.tsx"),
  ]),
] satisfies RouteConfig;
