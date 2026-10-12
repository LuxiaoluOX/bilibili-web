import { CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined, MinusCircleOutlined } from "@ant-design/icons";
import { Alert, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Route } from "./+types/runs";
import { tablePagination, WorkbenchProTable } from "../components/data-display";
import { MetricGrid, PageHeader } from "../components/layout";
import { requireUser } from "../lib/auth.server";
import type { CrawlRunStatus } from "../lib/domain";
import { listRuns } from "../lib/repository.server";
import { getWorkerReliability } from "../lib/worker-reliability.server";

export function meta(){return[{title:"抓取任务 · 三角洲行动数据中台"}]}
export async function loader({request}:Route.LoaderArgs){await requireUser(request);const[runs,worker]=await Promise.all([listRuns(),getWorkerReliability()]);return{runs,worker}}
type Run=Awaited<ReturnType<typeof listRuns>>[number];
const statusMap:Record<CrawlRunStatus,{label:string;color:string;icon:React.ReactNode}>={queued:{label:"排队中",color:"default",icon:<MinusCircleOutlined/>},running:{label:"运行中",color:"processing",icon:<LoadingOutlined/>},succeeded:{label:"成功",color:"success",icon:<CheckCircleOutlined/>},partially_succeeded:{label:"部分成功",color:"warning",icon:<CheckCircleOutlined/>},failed:{label:"失败",color:"error",icon:<CloseCircleOutlined/>},cancelled:{label:"已取消",color:"default",icon:<MinusCircleOutlined/>}};
export default function Runs({loaderData}:Route.ComponentProps){
  const running=loaderData.runs.filter((run)=>run.status==="running"||run.status==="queued").length;
  const failed=loaderData.runs.filter((run)=>run.status==="failed").length;
  const succeeded=loaderData.runs.filter((run)=>run.status==="succeeded"||run.status==="partially_succeeded").length;
  const workerLabel=loaderData.worker.online?"在线":loaderData.worker.state==="never_seen"?"未启动":"离线";
  const lastHeartbeat=loaderData.worker.lastHeartbeatAt?new Date(loaderData.worker.lastHeartbeatAt).toLocaleString("zh-CN"):"暂无心跳记录";
  const columns:ColumnsType<Run>=[
    {title:"博主",dataIndex:"creatorName",fixed:"left",width:180,align:"left"},
    {title:"触发方式",dataIndex:"trigger",width:110,align:"center",render:v=>({manual:"手动",schedule:"计划",backfill:"首次回溯"}[v as string]??v)},
    {title:"状态",dataIndex:"status",width:130,align:"center",render:(v:CrawlRunStatus,row)=>{
      const cooling=row.errorMessage?.includes("风控冷却");
      if(row.isStale)return <Tag color="error" icon={<CloseCircleOutlined/>}>疑似卡死</Tag>;
      return <Tag color={cooling?"warning":statusMap[v].color} icon={statusMap[v].icon}>{cooling?"风控冷却":statusMap[v].label}</Tag>;
    }},
    {title:"尝试",dataIndex:"attempt",width:80,align:"right"},
    {title:"扫描视频",dataIndex:"videosScanned",width:100,align:"right"},
    {title:"候选码",dataIndex:"candidatesFound",width:100,align:"right"},
    {title:"任务心跳",dataIndex:"heartbeatAt",width:180,align:"center",render:v=>v?new Date(v).toLocaleString("zh-CN"):"—"},
    {title:"下次尝试",dataIndex:"availableAt",width:180,align:"center",render:(v,run)=>run.status==="queued"?new Date(v).toLocaleString("zh-CN"):"—"},
    {title:"创建时间",dataIndex:"createdAt",width:180,align:"center",render:v=>new Date(v).toLocaleString("zh-CN")},
    {title:"错误",dataIndex:"errorMessage",width:280,align:"left",render:v=>v?<Typography.Text type="danger">{v}</Typography.Text>:"—"},
  ];
  return <div className="page">
    <PageHeader eyebrow="CRAWL RUNS" title="抓取任务" description="低频串行执行；普通失败按 30 秒起指数退避，风控任务冷却 6–12 小时。"/>
    {!loaderData.worker.online?<Alert className="settings-alert" type="error" showIcon title={`抓取 Worker ${workerLabel}`} description={`最后心跳：${lastHeartbeat}。Worker 恢复前，排队任务不会执行。`}/>:loaderData.worker.staleRuns?<Alert className="settings-alert" type="warning" showIcon title={`${loaderData.worker.staleRuns} 个运行任务心跳过期`} description="Worker 每分钟检查一次，超过 15 分钟无任务心跳时会自动重新排队；达到最大尝试次数则标记失败。"/>:null}
    <MetricGrid items={[
      {key:"worker",label:"Worker",value:workerLabel,hint:`最后心跳：${lastHeartbeat}`,status:loaderData.worker.online?"success":"danger"},
      {key:"active",label:"活动任务",value:running,hint:`可执行 ${loaderData.worker.readyRuns} · 延迟重试 ${loaderData.worker.delayedRuns}`,status:running?"info":"neutral"},
      {key:"success",label:"完成任务",value:succeeded,hint:"当前记录范围",status:"success"},
      {key:"failed",label:"失败任务",value:failed,hint:failed?"需要检查错误":"运行稳定",status:failed?"danger":"success"},
      {key:"videos",label:"累计扫描视频",value:loaderData.runs.reduce((sum,run)=>sum+run.videosScanned,0),hint:"当前记录范围"},
      {key:"codes",label:"累计候选码",value:loaderData.runs.reduce((sum,run)=>sum+run.candidatesFound,0),hint:"当前记录范围",status:"warning"},
    ]}/>
    <section className="table-section"><WorkbenchProTable preferenceKey="runs" rowKey="id" columns={columns} dataSource={loaderData.runs} scroll={{x:1590}} pagination={tablePagination(12,"条任务")}/></section>
  </div>
}
