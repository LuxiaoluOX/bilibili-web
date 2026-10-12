import { Descriptions, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Route } from "./+types/audit";
import { CountTag, tablePagination, WorkbenchProTable } from "../components/data-display";
import { PageHeader } from "../components/layout";
import { requireRole } from "../lib/auth.server";
import { listAuditLogs } from "../lib/repository.server";

export function meta(){return[{title:"操作日志 · 三角洲行动数据中台"}]}
export async function loader({request}:Route.LoaderArgs){await requireRole(request,["admin"]);return{logs:await listAuditLogs()}}
type Log=Awaited<ReturnType<typeof listAuditLogs>>[number];
export default function Audit({loaderData}:Route.ComponentProps){const columns:ColumnsType<Log>=[{title:"时间",dataIndex:"createdAt",fixed:"left",width:210,align:"center",render:v=>new Date(v).toLocaleString("zh-CN")},{title:"操作者",dataIndex:"actorName",width:180,align:"left"},{title:"操作",dataIndex:"action",width:260,align:"center",render:v=><CountTag tone="cyan">{v}</CountTag>},{title:"对象",width:260,align:"left",render:(_,r)=><Typography.Text>{r.entityType} {r.entityId?.slice(0,8)??""}</Typography.Text>}];return <div className="page"><PageHeader eyebrow="AUDIT TRAIL" title="操作日志" description="关键配置、审核、用户和抓取操作的可追溯记录。"/><section className="table-section"><WorkbenchProTable preferenceKey="audit" rowKey="id" columns={columns} dataSource={loaderData.logs} scroll={{x:980}} pagination={tablePagination(15, "条日志")} expandable={{expandedRowRender:(record)=><Descriptions size="small" bordered column={1} items={Object.entries(record.details??{}).map(([key,value])=>({key,label:key,children:typeof value==="object"?JSON.stringify(value):String(value)}))}/>,rowExpandable:(record)=>Boolean(record.details&&Object.keys(record.details).length)}}/></section></div>}
