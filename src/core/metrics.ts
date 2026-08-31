import { config } from "./config";
import { sql } from "./db";

export const operationalMetricNames = ["http.public_request", "http.public_4xx", "http.public_5xx", "publishing.completed", "form.submitted", "media.changed", "backup.created"] as const;
export type OperationalMetric = typeof operationalMetricNames[number];

function isOperationalMetric(value: string): value is OperationalMetric {
  return (operationalMetricNames as readonly string[]).includes(value);
}

export async function incrementOperationalMetric(metric: OperationalMetric) {
  await sql`
    insert into operational_metrics (bucket_start, metric, value)
    values (date_trunc('hour', now()), ${metric}, 1)
    on conflict (bucket_start, metric) do update set value = operational_metrics.value + 1
  `;
}

export function metricForAuditAction(action: string): OperationalMetric | null {
  if (action === "form.submit") return "form.submitted";
  if (action === "backup.create") return "backup.created";
  if (action.startsWith("media.")) return "media.changed";
  return null;
}

export async function getOperationalMetrics(hours = 168) {
  const windowHours = Math.max(1, Math.min(24 * 90, Math.trunc(hours)));
  const rows = await sql`
    select bucket_start, metric, value
    from operational_metrics
    where bucket_start >= date_trunc('hour', now()) - make_interval(hours => ${windowHours - 1})
    order by bucket_start desc, metric asc
  `;
  const totals = new Map<OperationalMetric, number>(operationalMetricNames.map((metric) => [metric, 0]));
  for (const row of rows) {
    const metric = String(row.metric);
    if (isOperationalMetric(metric)) totals.set(metric, (totals.get(metric) ?? 0) + Number(row.value));
  }
  return {
    hours: windowHours,
    totals: Object.fromEntries(totals) as Record<OperationalMetric, number>,
    rows: rows.map((row) => ({ bucketStart: String(row.bucket_start), metric: String(row.metric), value: Number(row.value) })),
  };
}

export async function deleteExpiredOperationalMetrics() {
  if (config.metricsRetentionDays === 0) return 0;
  const result = await sql`delete from operational_metrics where bucket_start < now() - make_interval(days => ${config.metricsRetentionDays})`;
  return result.count;
}
