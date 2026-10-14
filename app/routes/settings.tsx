import { KeyOutlined, SettingOutlined } from "@ant-design/icons";
import { ProForm, ProFormText } from "@ant-design/pro-components";
import { data, useFetcher } from "react-router";
import type { Route } from "./+types/settings";
import { ActionButton } from "../components/actions";
import { StatusBadge } from "../components/data-display";
import { useFetcherToast } from "../components/feedback";
import { PageHeader } from "../components/layout";
import { audit } from "../lib/audit.server";
import { requireRole, requireUser } from "../lib/auth.server";
import { credentialStatus } from "../lib/credentials.server";
import { APP_TIMEZONE, DEFAULT_CRON, nextCronRun, validateCron } from "../lib/cron.server";
import { query, transaction } from "../lib/db.server";

export function meta(){return[{title:"系统设置 · 三角洲行动数据中台"}]}
export async function loader({request}:Route.LoaderArgs){const user=await requireUser(request);const settings=await query<{cron_expression:string}>("select coalesce(value->>'cronExpression',$1) cron_expression from system_settings where key='global_schedule'",[DEFAULT_CRON]);return{user,cron:settings.rows[0]?.cron_expression??DEFAULT_CRON,credential:await credentialStatus()}}
export async function action({request}:Route.ActionArgs){const user=await requireRole(request,["admin"]);const form=await request.formData();const intent=String(form.get("intent"));if(intent==="schedule"){const cron=String(form.get("cron")??"").trim();const validation=validateCron(cron);if(!validation.valid)return data({ok:false,message:"Cron 表达式无效"},{status:400});const nextRun=nextCronRun(cron);await transaction(async(client)=>{await client.query(`insert into system_settings(key,value,updated_by) values('global_schedule',jsonb_build_object('cronExpression',$1::text,'timezone',$2::text),$3) on conflict(key) do update set value=excluded.value,updated_by=excluded.updated_by,updated_at=now()`,[cron,APP_TIMEZONE,user.id]);await client.query("update creators set next_run_at=$1,updated_at=now() where schedule_mode='inherit'",[nextRun]);});await audit(user.id,"settings.schedule.updated","system_setting","global_schedule",{cron});return data({ok:true,message:"全局计划已保存",nextRuns:validation.nextRuns});}return data({ok:false,message:"未知操作"},{status:400})}
export default function Settings({ loaderData }: Route.ComponentProps) {
  const fetcher = useFetcher<typeof action>();
  useFetcherToast(fetcher, { loading: "正在保存系统设置…" });
  const admin = loaderData.user.role === "admin";
  const credential = loaderData.credential;

  return <div className="page preferences-page">
    <PageHeader eyebrow="SYSTEM SETTINGS" title="系统设置" description="管理抓取计划与账号连接。" />
    <div className="preferences-layout">
      <section className="preferences-panel">
        <div className="preferences-panel-heading">
          <span className="preferences-icon"><SettingOutlined /></span>
          <div><h2>抓取计划</h2><p>统一设置继承全局计划的创作者。</p></div>
          <StatusBadge status="info" label="全局配置" />
        </div>
        <div className="preferences-panel-body">
          <ProForm initialValues={{ cron: loaderData.cron }}
            submitter={admin ? { searchConfig: { submitText: "保存计划" }, resetButtonProps: { style: { display: "none" } }, submitButtonProps: { loading: fetcher.state !== "idle" } } : false}
            onFinish={async (values) => {
              fetcher.submit({ intent: "schedule", cron: String(values.cron ?? "") }, { method: "post" });
              return true;
            }}>
            <ProFormText name="cron" label="Cron 表达式" disabled={!admin} fieldProps={{ className: "preferences-cron-input" }} />
            <p className="preferences-helper">默认每 12 小时一次；自定义计划的创作者不受影响。</p>
          </ProForm>
        </div>
        <div className="preferences-rule-list">
          <div><span>执行时区</span><strong>Asia/Shanghai</strong></div>
          <div><span>首次抓取</span><strong>最近 30 条视频简介</strong></div>
          <div><span>日常更新</span><strong>新增视频 + 最近 5 条</strong></div>
          <div><span>完整复查</span><strong>每周一次</strong></div>
        </div>
      </section>
      <aside className="preferences-aside">
        <section className="preferences-panel">
          <div className="preferences-panel-heading">
            <span className="preferences-icon"><KeyOutlined /></span>
            <div><h2>B 站连接</h2><p>抓取所需的账号会话。</p></div>
          </div>
          <div className="preferences-panel-body">
            <div className="preferences-account-line"><strong>{credential.accountName ?? "尚未连接账号"}</strong><StatusBadge status={credential.status === "valid" ? "success" : "warning"} label={credential.status === "valid" ? "有效" : credential.configured ? "需更新" : "未连接"} /></div>
            <dl className="preferences-details"><div><dt>更新时间</dt><dd>{credential.updatedAt ? new Date(credential.updatedAt).toLocaleString("zh-CN") : "—"}</dd></div></dl>
            <ActionButton kind="secondary" to="/bilibili-session" block>管理 B 站会话</ActionButton>
          </div>
        </section>
        <section className="preferences-note">
          <h3>低频抓取</h3>
          <p>请求随机间隔 3.5–5 秒。遇到平台风控后，自动冷却 6–12 小时。</p>
        </section>
      </aside>
    </div>
  </div>;
}
