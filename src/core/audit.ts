import type { Context } from "hono";
import { sql } from "./db";
import { config } from "./config";
import { createOperatorNotification } from "./notifications";
import { emitHook } from "./hooks";

const notificationActions = new Set([
  "auth.login",
  "auth.logout",
  "post.delete",
  "page.delete",
  "media.delete",
  "snapshot.restore",
  "post.revision.restore",
  "page.revision.restore",
  "menu.delete",
  "block.delete",
  "ai.proposal.create",
  "ai.proposal.approve",
  "ai.proposal.reject",
]);

export type AuditLogRecord = {
  id: number;
  actorUserId: number | null;
  actorDisplayName: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  summary: string;
  ipAddress: string | null;
  createdAt: string;
};

function normalizeAudit(row: Record<string, unknown>): AuditLogRecord {
  return {
    id: Number(row.id),
    actorUserId: row.actor_user_id ? Number(row.actor_user_id) : null,
    actorDisplayName: (row.actor_display_name as string | null) ?? null,
    action: String(row.action),
    targetType: String(row.target_type),
    targetId: row.target_id ? String(row.target_id) : null,
    summary: String(row.summary),
    ipAddress: (row.ip_address as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

export async function writeAuditLog(input: {
  actorUserId?: number | null;
  action: string;
  targetType: string;
  targetId?: string | number | null;
  summary: string;
  ipAddress?: string | null;
}) {
  await sql`
    insert into audit_logs (
      actor_user_id,
      action,
      target_type,
      target_id,
      summary,
      ip_address
    ) values (
      ${input.actorUserId ?? null},
      ${input.action},
      ${input.targetType},
      ${input.targetId != null ? String(input.targetId) : null},
      ${input.summary},
      ${input.ipAddress ?? null}
    )
  `;
  if (notificationActions.has(input.action)) {
    const level = input.action.includes("delete") || input.action.includes("restore") ? "warning" : "info";
    await createOperatorNotification({ level, action: input.action, message: input.summary }).catch(() => undefined);
  }
  await emitHook("audit", { ...input });
}

export async function listAuditLogs(limit = 100, search?: string, action?: string) {
  const params: (string | number)[] = [];
  const filters: string[] = [];
  if (search?.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    filters.push(`(lower(a.summary) like $${params.length} or lower(a.target_type) like $${params.length} or lower(coalesce(u.display_name, '')) like $${params.length})`);
  }
  if (action?.trim()) {
    params.push(action.trim());
    filters.push(`a.action = $${params.length}`);
  }
  const whereSql = filters.length ? `where ${filters.join(" and ")}` : "";
  params.push(Math.max(1, Math.min(500, limit)));
  const rows = await sql.unsafe(`
    select
      a.id,
      a.actor_user_id,
      u.display_name as actor_display_name,
      a.action,
      a.target_type,
      a.target_id,
      a.summary,
      a.ip_address,
      a.created_at
    from audit_logs a
    left join users u on u.id = a.actor_user_id
    ${whereSql}
    order by a.created_at desc, a.id desc
    limit $${params.length}
  `, params as any[]);

  return rows.map((row) => normalizeAudit(row as Record<string, unknown>));
}

export function requestIp(c: Context) {
  if (config.trustProxy) {
    return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || null;
  }
  return null;
}
