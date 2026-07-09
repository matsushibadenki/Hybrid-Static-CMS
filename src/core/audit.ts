import type { Context } from "hono";
import { sql } from "./db";

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
}

export async function listAuditLogs(limit = 100) {
  const rows = await sql`
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
    order by a.created_at desc, a.id desc
    limit ${limit}
  `;

  return rows.map((row) => normalizeAudit(row as Record<string, unknown>));
}

export function requestIp(c: Context) {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || null;
}
