import { sql } from "./db";
import { renderPublishedArtifacts } from "./renderer";
import { logInfo, logWarn } from "./logger";

export type BackgroundJob = { id: number; jobType: "render_public_artifacts"; status: "queued" | "running" | "completed" | "failed"; attempts: number; runAfter: string; lastError: string | null; createdAt: string; completedAt: string | null };

function normalize(row: Record<string, unknown>): BackgroundJob {
  return { id: Number(row.id), jobType: row.job_type as BackgroundJob["jobType"], status: row.status as BackgroundJob["status"], attempts: Number(row.attempts), runAfter: String(row.run_after), lastError: row.last_error ? String(row.last_error) : null, createdAt: String(row.created_at), completedAt: row.completed_at ? String(row.completed_at) : null };
}

export async function enqueuePublicRender() {
  const rows = await sql`
    insert into background_jobs (job_type) values ('render_public_artifacts')
    on conflict (job_type) where status in ('queued', 'running') do update set updated_at = now()
    returning *
  `;
  return normalize(rows[0] as Record<string, unknown>);
}

export async function listBackgroundJobs(limit = 30) {
  const rows = await sql`select * from background_jobs order by created_at desc, id desc limit ${Math.max(1, Math.min(limit, 100))}`;
  return rows.map((row) => normalize(row as Record<string, unknown>));
}

export async function processBackgroundJobs() {
  const claimed = await sql`
    with next as (
      select id from background_jobs where status = 'queued' and run_after <= now()
      order by run_after, id for update skip locked limit 1
    ) update background_jobs job set status = 'running', attempts = attempts + 1, updated_at = now()
    from next where job.id = next.id returning job.*
  `;
  if (!claimed[0]) return { processed: false };
  const job = normalize(claimed[0] as Record<string, unknown>);
  try {
    await renderPublishedArtifacts();
    await sql`update background_jobs set status = 'completed', completed_at = now(), updated_at = now(), last_error = null where id = ${job.id}`;
    logInfo("jobs.render_completed", "Queued public artifact generation completed.", { jobId: job.id });
    return { processed: true, succeeded: true, jobId: job.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown rendering error";
    await sql`update background_jobs set status = case when attempts >= 6 then 'failed' else 'queued' end, run_after = now() + make_interval(secs => least(3600, 60 * power(2, least(attempts, 6))::integer)), last_error = ${message.slice(0, 1000)}, updated_at = now() where id = ${job.id}`;
    logWarn("jobs.render_failed", "Queued public artifact generation failed.", { jobId: job.id, error });
    return { processed: true, succeeded: false, jobId: job.id };
  }
}
