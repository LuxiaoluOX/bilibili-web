import { DeleteOutlined, PlusOutlined, SettingOutlined } from "@ant-design/icons";
import argon2 from "argon2";
import { Input, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import { data, useFetcher } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/users";
import { ActionButton, ActionGroup, ConfirmAction } from "../components/actions";
import { CountTag, StatusBadge, tablePagination, WorkbenchProTable } from "../components/data-display";
import { useFetcherToast } from "../components/feedback";
import { FormError, FormModal } from "../components/forms";
import { PageHeader } from "../components/layout";
import { audit } from "../lib/audit.server";
import { requireRole } from "../lib/auth.server";
import { query, transaction } from "../lib/db.server";
import type { Role } from "../lib/domain";
import { ROLE_LABELS } from "../lib/domain";
import { listUsers } from "../lib/repository.server";

export function meta() { return [{ title: "权限管理 · 三角洲行动数据中台" }]; }

export async function loader({ request }: Route.LoaderArgs) {
  const actor = await requireRole(request, ["admin"]);
  return { actorId: actor.id, users: await listUsers() };
}

const usernameSchema = z.string().trim().min(3, "用户名至少 3 位").max(32, "用户名最多 32 位")
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "用户名只能包含字母、数字、下划线和连字符");
const accountSchema = z.object({
  username: usernameSchema,
  displayName: z.string().trim().min(2, "显示名称至少 2 位").max(50, "显示名称最多 50 位"),
  email: z.union([z.literal(""), z.email("邮箱格式不正确")]),
  role: z.enum(["admin", "operator", "viewer"]),
  isActive: z.boolean(),
  password: z.string(),
});

export async function action({ request }: Route.ActionArgs) {
  const actor = await requireRole(request, ["admin"]);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  try {
    if (intent === "delete") {
      const userId = String(form.get("userId") ?? "");
      if (userId === actor.id) return data({ ok: false, message: "不能删除当前登录账号" }, { status: 400 });
      const outcome = await transaction(async (client) => {
        await client.query("select pg_advisory_xact_lock(hashtext('users:active-admin'))");
        const target = await client.query<{ role: Role; is_active: boolean }>(
          "select role, is_active from users where id = $1 and deleted_at is null for update",
          [userId],
        );
        if (!target.rows[0]) return { ok: false as const, message: "用户不存在或已经删除", status: 404 };
        if (target.rows[0].role === "admin" && target.rows[0].is_active) {
          const remaining = await client.query<{ count: string }>(
            "select count(*)::text count from users where id <> $1 and role = 'admin' and is_active = true and deleted_at is null",
            [userId],
          );
          if (Number(remaining.rows[0]?.count ?? 0) === 0) {
            return { ok: false as const, message: "至少需要保留一位启用中的管理员", status: 400 };
          }
        }
        await client.query("update users set is_active = false, deleted_at = now(), updated_at = now() where id = $1", [userId]);
        await client.query("delete from sessions where user_id = $1", [userId]);
        return { ok: true as const };
      });
      if (!outcome.ok) return data({ ok: false, message: outcome.message }, { status: outcome.status });
      await audit(actor.id, "user.deleted", "user", userId);
      return data({ ok: true, message: "用户已删除" });
    }

    const userId = String(form.get("userId") ?? "");
    const parsed = accountSchema.safeParse({
      username: String(form.get("username") ?? ""),
      displayName: String(form.get("displayName") ?? ""),
      email: String(form.get("email") ?? "").trim().toLowerCase(),
      role: String(form.get("role") ?? ""),
      isActive: String(form.get("isActive") ?? "true") === "true",
      password: String(form.get("password") ?? ""),
    });
    if (!parsed.success) return data({ ok: false, message: parsed.error.issues[0].message }, { status: 400 });
    const account = parsed.data;

    if (intent === "create") {
      if (account.password.length < 8) return data({ ok: false, message: "密码至少 8 位" }, { status: 400 });
      const hash = await argon2.hash(account.password, { type: argon2.argon2id });
      const result = await query<{ id: string }>(
        `insert into users (username, email, display_name, password_hash, role, is_active)
         values ($1, $2, $3, $4, $5, $6) returning id`,
        [account.username.toLowerCase(), account.email || null, account.displayName, hash, account.role, account.isActive],
      );
      await audit(actor.id, "user.created", "user", result.rows[0].id, { username: account.username, role: account.role });
      return data({ ok: true, message: "用户已创建" });
    }

    if (intent === "update") {
      if (userId === actor.id && (account.role !== "admin" || !account.isActive)) {
        return data({ ok: false, message: "不能停用当前账号或移除自己的管理员权限" }, { status: 400 });
      }
      if (account.password && account.password.length < 8) return data({ ok: false, message: "新密码至少 8 位；不修改请留空" }, { status: 400 });
      const passwordHash = account.password ? await argon2.hash(account.password, { type: argon2.argon2id }) : null;
      const outcome = await transaction(async (client) => {
        await client.query("select pg_advisory_xact_lock(hashtext('users:active-admin'))");
        const target = await client.query<{ role: Role; is_active: boolean }>(
          "select role, is_active from users where id = $1 and deleted_at is null for update",
          [userId],
        );
        if (!target.rows[0]) return { ok: false as const, message: "用户不存在或已经删除", status: 404 };
        if (target.rows[0].role === "admin" && target.rows[0].is_active && (account.role !== "admin" || !account.isActive)) {
          const remaining = await client.query<{ count: string }>(
            "select count(*)::text count from users where id <> $1 and role = 'admin' and is_active = true and deleted_at is null",
            [userId],
          );
          if (Number(remaining.rows[0]?.count ?? 0) === 0) {
            return { ok: false as const, message: "至少需要保留一位启用中的管理员", status: 400 };
          }
        }
        await client.query(
          `update users set username = $2, email = $3, display_name = $4, role = $5, is_active = $6,
             password_hash = coalesce($7, password_hash), updated_at = now()
           where id = $1 and deleted_at is null`,
          [userId, account.username.toLowerCase(), account.email || null, account.displayName, account.role, account.isActive, passwordHash],
        );
        if (passwordHash || !account.isActive) await client.query("delete from sessions where user_id = $1", [userId]);
        return { ok: true as const };
      });
      if (!outcome.ok) return data({ ok: false, message: outcome.message }, { status: outcome.status });
      await audit(actor.id, "user.updated", "user", userId, { username: account.username, role: account.role, isActive: account.isActive, passwordChanged: Boolean(passwordHash) });
      return data({ ok: true, message: "用户设置已保存" });
    }

    return data({ ok: false, message: "未知操作" }, { status: 400 });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "23505") return data({ ok: false, message: "用户名或邮箱已被其他用户使用" }, { status: 400 });
    return data({ ok: false, message: error instanceof Error ? error.message : "用户操作失败" }, { status: 400 });
  }
}

type User = Awaited<ReturnType<typeof listUsers>>[number];

export default function Users({ loaderData }: Route.ComponentProps) {
  const [editor, setEditor] = useState<User | "new" | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const saveFetcher = useFetcher<typeof action>();
  const deleteFetcher = useFetcher<typeof action>();
  useFetcherToast(saveFetcher, { loading: "正在保存用户…" });
  useFetcherToast(deleteFetcher, { loading: "正在删除用户…" });
  const editingUser = editor === "new" ? null : editor;

  useEffect(() => {
    if (saveFetcher.state !== "idle" || !saveFetcher.data) return;
    if (saveFetcher.data.ok) {
      setEditor(null);
      setModalError(null);
    } else {
      setModalError(saveFetcher.data.message);
    }
  }, [saveFetcher.state, saveFetcher.data]);

  const openEditor = (user: User | "new") => {
    setModalError(null);
    setEditor(user);
  };

  const columns: ColumnsType<User> = [
    { title: "账号", fixed: "left", width: 270, align: "left", render: (_, user) => <div className="user-account-cell">
      <Typography.Text strong>{user.username}</Typography.Text>
      <Typography.Text>{user.displayName}</Typography.Text>
      <Typography.Text type="secondary">{user.email || "未设置联系邮箱"}</Typography.Text>
    </div> },
    { title: "角色", dataIndex: "role", width: 140, align: "center", render: (role: Role) => <CountTag tone={role === "operator" ? "cyan" : role === "admin" ? "amber" : "default"}>{ROLE_LABELS[role]}</CountTag> },
    { title: "状态", dataIndex: "isActive", width: 120, align: "center", render: (active) => <StatusBadge status={active ? "success" : "neutral"} label={active ? "启用" : "停用"} /> },
    { title: "最后更新", dataIndex: "updatedAt", width: 190, align: "center", render: (value) => new Date(value).toLocaleString("zh-CN") },
    { title: "操作", fixed: "right", width: 180, align: "center", render: (_, user) => <ActionGroup compact>
      <ActionButton kind="link" scale="row" icon={<SettingOutlined />} onClick={() => openEditor(user)}>设置</ActionButton>
      <ConfirmAction
        title="删除这个用户？"
        description="该用户会立即退出登录，历史操作记录仍会保留。"
        confirmText="删除"
        confirmLoading={deleteFetcher.state !== "idle" && deleteFetcher.formData?.get("userId") === user.id}
        onConfirm={() => deleteFetcher.submit({ intent: "delete", userId: user.id }, { method: "post" })}
        disabled={user.id === loaderData.actorId}
        icon={<DeleteOutlined />}
      >
        删除
      </ConfirmAction>
    </ActionGroup> },
  ];

  return <div className="page">
    <PageHeader eyebrow="ACCESS CONTROL" title="权限管理" description="通过用户名管理管理员、运营和只读成员，并控制账号状态与登录凭据。" actions={<ActionButton kind="primary" icon={<PlusOutlined />} onClick={() => openEditor("new")}>添加用户</ActionButton>} />
    <section className="table-section"><WorkbenchProTable preferenceKey="users" rowKey="id" columns={columns} dataSource={loaderData.users} scroll={{ x: 920 }} pagination={tablePagination(12, "位用户")} /></section>
    <FormModal title={editingUser ? `用户设置 · ${editingUser.username}` : "添加用户"} open={editor !== null} onClose={() => setEditor(null)}>
      <saveFetcher.Form method="post" key={editingUser?.id ?? "new"}>
        <input type="hidden" name="intent" value={editingUser ? "update" : "create"} />
        {editingUser ? <input type="hidden" name="userId" value={editingUser.id} /> : null}
        <div className="user-form-grid">
          <label><span>用户名</span><Input name="username" defaultValue={editingUser?.username} placeholder="例如：admin" autoComplete="off" required /></label>
          <label><span>显示名称</span><Input name="displayName" defaultValue={editingUser?.displayName} placeholder="成员在系统中的名称" required /></label>
          <label className="user-form-wide"><span>联系邮箱（可选）</span><Input name="email" type="email" defaultValue={editingUser?.email ?? ""} placeholder="仅用于识别，不参与登录" autoComplete="off" /></label>
          <label><span>角色</span><select name="role" defaultValue={editingUser?.role ?? "viewer"} className="native-select">{Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>账号状态</span><select name="isActive" defaultValue={String(editingUser?.isActive ?? true)} className="native-select"><option value="true">启用</option><option value="false">停用</option></select></label>
          <label className="user-form-wide"><span>{editingUser ? "重置密码（不修改请留空）" : "初始密码"}</span><Input.Password name="password" placeholder="至少 8 位" required={!editingUser} autoComplete="new-password" /></label>
        </div>
        <FormError>{modalError}</FormError>
        <ActionButton className="modal-submit" kind="primary" htmlType="submit" block loading={saveFetcher.state !== "idle"}>{editingUser ? "保存用户设置" : "创建用户"}</ActionButton>
      </saveFetcher.Form>
    </FormModal>
  </div>;
}
