import { config } from "./config";
import { sql } from "./db";

export type DatabaseHealth = {
  version: string;
  databaseSizeBytes: number;
  activeConnections: number;
  maxConnections: number;
  slowActiveQueries: number;
  longestTransactionSeconds: number | null;
  tables: Array<{ name: string; liveRows: number; deadRows: number }>;
  retention: { auditLogDays: number; readNotificationDays: number };
};

function toNumber(value: unknown) { return Number.isFinite(Number(value)) ? Number(value) : 0; }

export async function getDatabaseHealth(): Promise<DatabaseHealth> {
  const [versionRows, sizeRows, activityRows, transactionRows, tables] = await Promise.all([
    sql`select version() as value`,
    sql`select pg_database_size(current_database())::bigint as value`,
    sql`select count(*) filter (where state <> 'idle')::int as active, current_setting('max_connections')::int as max from pg_stat_activity`,
    sql`select count(*) filter (where state <> 'idle' and query_start < now() - make_interval(secs => ${config.databaseSlowQuerySeconds}))::int as slow, max(extract(epoch from now() - xact_start)) filter (where xact_start is not null)::float as longest from pg_stat_activity where datname = current_database()`,
    sql`select relname, n_live_tup, n_dead_tup from pg_stat_user_tables order by n_dead_tup desc, relname asc limit 12`,
  ]);
  const version = versionRows[0];
  const size = sizeRows[0];
  const activity = activityRows[0];
  const transactions = transactionRows[0];
  return {
    version: String(version?.value ?? "Unknown"),
    databaseSizeBytes: toNumber(size?.value),
    activeConnections: toNumber(activity?.active),
    maxConnections: toNumber(activity?.max),
    slowActiveQueries: toNumber(transactions?.slow),
    longestTransactionSeconds: transactions?.longest == null ? null : toNumber(transactions.longest),
    tables: tables.map((row) => ({ name: String(row.relname), liveRows: toNumber(row.n_live_tup), deadRows: toNumber(row.n_dead_tup) })),
    retention: { auditLogDays: config.databaseAuditLogRetentionDays, readNotificationDays: config.databaseReadNotificationRetentionDays },
  };
}

export async function runDatabaseAnalyze() {
  await sql.unsafe("analyze");
}

export async function deleteExpiredDatabaseRecords() {
  const [auditLogs, notifications] = await Promise.all([
    config.databaseAuditLogRetentionDays > 0
      ? sql`delete from audit_logs where created_at < now() - make_interval(days => ${config.databaseAuditLogRetentionDays})`
      : Promise.resolve({ count: 0 }),
    config.databaseReadNotificationRetentionDays > 0
      ? sql`delete from operator_notifications where is_read = true and created_at < now() - make_interval(days => ${config.databaseReadNotificationRetentionDays})`
      : Promise.resolve({ count: 0 }),
  ]);
  return { auditLogs: auditLogs.count, notifications: notifications.count };
}
