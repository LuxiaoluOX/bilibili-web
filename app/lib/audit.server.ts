import { query } from "./db.server";

export async function audit(actorId: string | null, action: string, entityType: string, entityId?: string, details: Record<string, unknown> = {}) {
  await query(
    "insert into audit_logs (actor_id, action, entity_type, entity_id, details) values ($1, $2, $3, $4, $5)",
    [actorId, action, entityType, entityId ?? null, JSON.stringify(details)],
  );
}
