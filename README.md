# 三角洲行动改枪码数据中台

只抓取 PostgreSQL 白名单中的 B 站博主，仅从视频简介中识别《三角洲行动》改枪码，不读取评论区，并保留可追溯的版本历史。首次回溯最近 30 条视频，日常只处理新增视频和最近 5 条，每周执行一次完整复查。

## 功能

- 白名单博主管理、停用、首次回溯与手动抓取
- 全局 Cron 与单博主覆盖，固定 `Asia/Shanghai` 时区
- 独立 Worker、PostgreSQL 任务队列、互斥领取、低频随机间隔和风控长冷却
- 内部接口优先、简介页面文本降级、手动粘贴导入兜底；不使用 OCR 或视频画面识别
- 高置信度自动入库、低置信度人工审核、原始来源追溯
- “博主 + 武器 + 方案名”版本链，重复码幂等更新
- 可按日期执行一次性历史简介分批回填；按视频发布时间从旧到新写入，最新视频中的改枪码保持为当前版本
- 管理员、运营、只读三档服务端权限
- Argon2id 密码、数据库会话、AES-256-GCM B 站 Cookie 加密
- 独立“B站会话”页：扫码登录、仅本机一次性账号密码登录、手动 Cookie 兜底和会话检测

## 本地启动

1. 复制 `.env.example` 为 `.env`，填写 PostgreSQL、加密密钥和管理员信息。
2. 初始化数据库与管理员：

   ```bash
   npm install
   npm run db:migrate
   npm run db:admin
   ```

3. 分别启动 Web 与 Worker：

   ```bash
   npm run dev
   npm run worker
   ```

4. 本机打开 `http://localhost:8088`；同一局域网设备打开 `http://<本机局域网 IP>:8088`。登录后到“B站会话”获取或更新会话。

账号密码与手动 Cookie 属于高敏感输入，只能在本机 `localhost` 的“B站会话”页面提交；局域网访问时这两个入口会被服务端拒绝。账号密码仅用于当次向 B 站换取会话，不会写入 PostgreSQL、日志或审计详情。扫码登录不向本系统提供账号密码，是默认推荐方式。

开发服务器固定监听 `0.0.0.0:8088`，不再只接受 localhost 访问。跨设备访问时请确保系统防火墙允许 8088 端口。

`db:migrate` 会在本地 PostgreSQL 中自动创建 URL 指定的数据库和 `schema`。开发演示数据可通过 `npm run db:seed` 单独写入。

## 常用命令

```bash
npm run typecheck
npm test
npm run build
npm run db:migrate
npm run db:admin
npm run db:seed
npm run db:reparse -- --since=2026-03-01
npm run db:backfill -- --since=2026-03-01 --creator-mid=52717408 --batch-size=10 --batch-delay-seconds=30 --dry-run
npm run worker
```

历史回填和历史重解析都必须显式提供 `--since`。重解析会按每条简介重新建立“候选码 → 武器方案 → 版本来源”关联，保留人工审核结果，并清理没有任何来源支撑的旧错误方案。回填建议先用 `--dry-run` 核对视频数量，再移除该参数正式执行。两者都不会修改 Cron 或日常增量轮询范围。方案列表的时间来自最新来源视频的发布时间，实际抓取时间继续保存在来源和任务记录中。

## 安全说明

- `.env` 已被 Git 忽略，禁止提交真实 Cookie、密码和密钥。
- `APP_ENCRYPTION_KEY` 与 `SESSION_SECRET` 均应使用至少 32 位的随机值。
- 后台不会返回已保存 Cookie 的明文。
- B 站接口适配集中在 `app/lib/bilibili.server.ts`，接口变化时可单独替换。
