import { sql } from "./db";
import { getFormById } from "./forms";
import { sendFormSubmissionEmail } from "./email";

export async function processMailOutbox(deliver = sendFormSubmissionEmail) {
  // A lost worker may have already delivered its message. Never silently resend it.
  await sql`update mail_outbox set status = 'uncertain', updated_at = now()
    where status = 'running' and updated_at < now() - interval '15 minutes'`;
  const rows = await sql`
    with due as (select id from mail_outbox where status = 'queued' and run_after <= now()
      order by run_after, id for update skip locked limit 1)
    update mail_outbox m set status = 'running', attempts = attempts + 1, updated_at = now()
      from due where m.id = due.id returning m.id, m.submission_id
  `;
  if (!rows[0]) return false;
  const id = Number(rows[0].id);
  let accepted = false;
  try {
    const submissions = await sql`select form_id, payload_json from form_submissions where id = ${rows[0].submission_id}`;
    const form = submissions[0] ? await getFormById(Number(submissions[0].form_id)) : null;
    if (!form) {
      await sql`update mail_outbox set status = 'failed', updated_at = now() where id = ${id}`;
      return true;
    }
    const result = await deliver(form, submissions[0].payload_json as Record<string, string>);
    if (!result.sent) throw new Error("Delivery unavailable");
    accepted = true;
    await sql`update mail_outbox set status = 'sent', updated_at = now() where id = ${id}`;
  } catch {
    if (accepted) {
      await sql`update mail_outbox set status = 'uncertain', updated_at = now() where id = ${id}`;
      return true;
    }
    await sql`update mail_outbox set status = case when attempts >= 6 then 'failed' else 'queued' end,
      run_after = now() + make_interval(secs => least(3600, 60 * power(2, attempts)::integer)),
      updated_at = now() where id = ${id} and status = 'running'`;
  }
  return true;
}

export async function listMailOutbox() {
  return sql`select id, submission_id, status, attempts, run_after, updated_at from mail_outbox order by id desc limit 100`;
}
