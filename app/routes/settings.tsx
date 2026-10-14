import { ClockCircleOutlined, KeyOutlined, RightOutlined, SettingOutlined, UserOutlined } from "@ant-design/icons";
import { Avatar, Input, Select } from "antd";
import { useState } from "react";
import { data, useFetcher } from "react-router";
import type { Route } from "./+types/settings";
import { ActionButton } from "../components/actions";
import { StatusBadge } from "../components/data-display";
import { useFetcherToast } from "../components/feedback";
import { audit } from "../lib/audit.server";
import { requireRole, requireUser } from "../lib/auth.server";
import { credentialStatus } from "../lib/credentials.server";
import { APP_TIMEZONE, DEFAULT_CRON, nextCronRun, validateCron } from "../lib/cron.server";
import { query, transaction } from "../lib/db.server";
import { SCHEDULE_OPTIONS, scheduleLabel, scheduleOption } from "../lib/schedule-options";

export function meta(){return[{title:"系统设置 · 三角洲行动数据中台"}]}
export async function loader({request}:Route.LoaderArgs){const user=await requireUser(request);const settings=await query<{cron_expression:string}>("select coalesce(value->>'cronExpression',$1) cron_expression from system_settings where key='global_schedule'",[DEFAULT_CRON]);return{user,cron:settings.rows[0]?.cron_expression??DEFAULT_CRON,credential:await credentialStatus()}}
export async function action({request}:Route.ActionArgs){const user=await requireRole(request,["admin"]);const form=await request.formData();const intent=String(form.get("intent"));if(intent==="schedule"){const cron=String(form.get("cron")??"").trim();const validation=validateCron(cron);if(!validation.valid)return data({ok:false,message:"Cron 表达式无效"},{status:400});const nextRun=nextCronRun(cron);await transaction(async(client)=>{await client.query(`insert into system_settings(key,value,updated_by) values('global_schedule',jsonb_build_object('cronExpression',$1::text,'timezone',$2::text),$3) on conflict(key) do update set value=excluded.value,updated_by=excluded.updated_by,updated_at=now()`,[cron,APP_TIMEZONE,user.id]);await client.query("update creators set next_run_at=$1,updated_at=now() where schedule_mode='inherit'",[nextRun]);});await audit(user.id,"settings.schedule.updated","system_setting","global_schedule",{cron});return data({ok:true,message:"全局计划已保存",nextRuns:validation.nextRuns});}return data({ok:false,message:"未知操作"},{status:400})}
export default function Settings({ loaderData }: Route.ComponentProps) {
  const fetcher = useFetcher<typeof action>();
  useFetcherToast(fetcher, { loading: "正在保存系统设置…" });
  const [section, setSection] = useState("schedule");
  const [cron, setCron] = useState(loaderData.cron);
  const [advanced, setAdvanced] = useState(!scheduleOption(loaderData.cron));
  const admin = loaderData.user.role === "admin";
  const credential = loaderData.credential;
  const sections = [
    { key: "schedule", title: "抓取计划", description: "设置全局执行频率", icon: <ClockCircleOutlined /> },
    { key: "policy", title: "抓取规则", description: "查看范围与请求节奏", icon: <SettingOutlined /> },
    { key: "connection", title: "账号连接", description: "管理 B 站会话", icon: <KeyOutlined /> },
  ];

  return <div className="page redesigned-settings-page">
    <header className="settings-title"><h1>系统设置</h1><p>管理抓取计划与账号连接。</p></header>
    <section className="connection-summary" aria-label="全局配置">
      <span className="settings-summary-icon"><SettingOutlined /></span>
      <div className="connection-summary-account">
        <div className="connection-summary-name"><strong>全局抓取配置</strong><StatusBadge status="info" label={admin ? "管理员可编辑" : "只读"} /></div>
        <div className="connection-summary-meta"><span>时区：Asia/Shanghai</span><span>当前计划：{scheduleLabel(loaderData.cron)}</span><span>仅影响继承全局计划的创作者</span></div>
      </div>
    </section>
    <div className="settings-workspace">
      <aside className="settings-section-nav"><h2>设置分类</h2><p>按需调整计划，查看执行规则。</p>
        <nav aria-label="设置分类">{sections.map((item) => <button key={item.key} type="button" className={section === item.key ? "settings-nav-item is-active" : "settings-nav-item"} aria-pressed={section === item.key} aria-controls={`settings-${item.key}`} onClick={() => setSection(item.key)}>
          <span className="settings-nav-icon">{item.icon}</span><span className="settings-nav-copy"><span className="settings-nav-title">{item.title}</span><span className="settings-nav-description">{item.description}</span></span><RightOutlined />
        </button>)}</nav>
      </aside>
      <div className="settings-active-surface">
        <section id="settings-schedule" hidden={section !== "schedule"} aria-label="抓取计划">
          <header className="settings-surface-title"><h2>抓取计划</h2><p>为继承全局计划的创作者设置统一执行频率。</p></header>
          <div className="settings-plan-editor">
            <fetcher.Form method="post" className="settings-frequency-form">
              <input type="hidden" name="intent" value="schedule" />
              <input type="hidden" name="cron" value={cron} />
              <label htmlFor="schedule-frequency">自动抓取频率</label>
              <Select id="schedule-frequency" value={advanced ? "custom" : cron.trim().replace(/\s+/g, " ")} disabled={!admin || fetcher.state !== "idle"}
                options={[...SCHEDULE_OPTIONS, { value: "custom", label: "自定义（高级设置）" }]}
                onChange={(value) => { setAdvanced(value === "custom"); if (value !== "custom") setCron(value); }} aria-describedby="schedule-frequency-help" />
              {advanced ? <div className="settings-advanced-schedule"><label htmlFor="schedule-cron">Cron 表达式</label><Input id="schedule-cron" value={cron} onChange={(event) => setCron(event.target.value)} disabled={!admin || fetcher.state !== "idle"} className="preferences-cron-input" /></div> : null}
              <p id="schedule-frequency-help" className="settings-muted">{advanced ? "保留自定义执行时间，使用 Cron 表达式配置。" : scheduleOption(cron)?.detail}（北京时间）</p>
              <p className="settings-muted">仅调整自动抓取频率，不影响手动抓取和创作者的单独计划。</p>
              {admin ? <ActionButton kind="primary" htmlType="submit" loading={fetcher.state !== "idle"}>保存计划</ActionButton> : null}
            </fetcher.Form>
          </div>
          <dl className="settings-definition-list"><div><dt>执行时区</dt><dd>Asia/Shanghai</dd></div><div><dt>生效范围</dt><dd>继承全局计划的创作者</dd></div><div><dt>单独配置</dt><dd><ActionButton kind="link" scale="row" to="/creators">前往创作者情报</ActionButton></dd></div></dl>
        </section>
        <section id="settings-policy" hidden={section !== "policy"} aria-label="抓取规则">
          <header className="settings-surface-title"><h2>抓取规则</h2><p>系统按以下规则执行简介抓取。</p></header>
          <dl className="settings-definition-list">
            <div><dt>首次抓取</dt><dd>最近 30 条视频简介</dd></div>
            <div><dt>日常更新</dt><dd>新增视频 + 最近 5 条</dd></div>
            <div><dt>完整复查</dt><dd>每周一次</dd></div>
            <div><dt>请求间隔</dt><dd>随机 3.5–5 秒</dd></div>
            <div><dt>风控冷却</dt><dd>6–12 小时后重试</dd></div>
            <div><dt>获取顺序</dt><dd>内部接口 → 简介页面 → 手动导入</dd></div>
          </dl>
        </section>
        <section id="settings-connection" hidden={section !== "connection"} aria-label="账号连接">
          <header className="settings-surface-title"><h2>账号连接</h2><p>查看抓取所需的 B 站账号会话。</p></header>
          <div className="settings-linked-account"><Avatar size={48} icon={<UserOutlined />} /><strong>{credential.accountName ?? "尚未连接账号"}</strong><StatusBadge status={credential.status === "valid" ? "success" : "warning"} label={credential.status === "valid" ? "有效" : credential.configured ? "需更新" : "未连接"} /></div>
          <dl className="settings-definition-list"><div><dt>更新时间</dt><dd>{credential.updatedAt ? new Date(credential.updatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : "—"}</dd></div></dl>
          <ActionButton kind="primary" to="/bilibili-session">管理 B 站会话</ActionButton>
        </section>
      </div>
    </div>
  </div>;
}
