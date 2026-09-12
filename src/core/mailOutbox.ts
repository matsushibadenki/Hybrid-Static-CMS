import { sql } from "./db";
import { getFormById } from "./forms";
import { MailDeliveryUncertainError, sendFormSubmissionEmail } from "./email";

export async function reviewMailDelivery(id: number, action: string, actorId: number) {
  if (!Number.isSafeInteger(id) || id < 1 || !["retry", "confirm"].includes(action)) return false;
  return sql.begin(async (trx) => {
    const rows = await trx`update mail_outbox set status = ${action === "retry" ? "queued" : "sent"},
      attempts = case when ${action === "retry"} then 0 else attempts end,
      delivery_id = case when ${action === "retry"} then gen_random_uuid() else delivery_id end,
      run_after = now(), updated_at = now()
      where id = ${id} and status in ('failed', 'uncertain') returning id`;
    if (!rows.length) return false;
    await trx`insert into audit_logs (actor_user_id, action, target_type, target_id, summary)
      values (${actorId}, ${`mail.review.${action}`}, 'mail_outbox', ${String(id)},
        ${action === "retry" ? "Operator reviewed delivery and queued another attempt." : "Operator confirmed delivery from provider logs."})`;
    return true;
  });
}

export async function processMailOutbox(deliver = sendFormSubmissionEmail) {
  // A lost worker may have already delivered its message. Never silently resend it.
  await sql`update mail_outbox set status = 'uncertain', updated_at = now()
    where status = 'running' and updated_at < now() - interval '15 minutes'`;
  const rows = await sql`
    with due as (select id from mail_outbox where status = 'queued' and run_after <= now()
      order by run_after, id for update skip locked limit 1)
    update mail_outbox m set status = 'running', attempts = attempts + 1, updated_at = now()
      from due where m.id = due.id returning m.id, m.submission_id, m.delivery_id
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
    const result = await deliver(form, submissions[0].payload_json as Record<string, string>, String(rows[0].delivery_id));
    if (!result.sent) throw new Error("Delivery unavailable");
    accepted = true;
    await sql`update mail_outbox set status = 'sent', updated_at = now() where id = ${id}`;
  } catch (error) {
    if (accepted || error instanceof MailDeliveryUncertainError) {
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
