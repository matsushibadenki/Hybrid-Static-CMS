import { sql } from "./db";

export type OperatorNotification = {
  id: number;
  level: "info" | "success" | "warning" | "error";
  action: string;
  message: string;
  isRead: boolean;
  createdAt: string;
};

function normalize(row: Record<string, unknown>): OperatorNotification {
  return {
    id: Number(row.id),
    level: row.level as OperatorNotification["level"],
    action: String(row.action),
    message: String(row.message),
    isRead: Boolean(row.is_read),
    createdAt: String(row.created_at),
  };
}

export async function createOperatorNotification(input: { level: OperatorNotification["level"]; action: string; message: string }) {
  await sql`
    insert into operator_notifications (level, action, message)
    values (${input.level}, ${input.action}, ${input.message})
  `;
}

export async function listOperatorNotifications(limit = 30, unreadOnly = false) {
  const rows = unreadOnly
    ? await sql`select * from operator_notifications where is_read = false order by created_at desc, id desc limit ${limit}`
    : await sql`select * from operator_notifications order by created_at desc, id desc limit ${limit}`;
  return rows.map((row) => normalize(row as Record<string, unknown>));
}

export async function markOperatorNotificationRead(id: number) {
  await sql`update operator_notifications set is_read = true where id = ${id}`;
}
