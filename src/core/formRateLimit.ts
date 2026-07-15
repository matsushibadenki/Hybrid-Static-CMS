import { sql } from "./db";
import { config } from "./config";

export async function consumeFormSubmissionRateLimit(formId: number, clientKey: string) {
  const attemptKey = `form:${formId}:${clientKey}`;
  await sql`
    insert into form_submission_attempts (attempt_key, attempts, window_started)
    values (${attemptKey}, 1, now())
    on conflict (attempt_key) do update set
      attempts = case
        when form_submission_attempts.window_started <= now() - make_interval(secs => ${config.formRateLimitWindowSeconds}) then 1
        else form_submission_attempts.attempts + 1
      end,
      window_started = case
        when form_submission_attempts.window_started <= now() - make_interval(secs => ${config.formRateLimitWindowSeconds}) then now()
        else form_submission_attempts.window_started
      end
  `;

  const rows = await sql`
    select attempts
    from form_submission_attempts
    where attempt_key = ${attemptKey}
    limit 1
  `;
  return Number(rows[0]?.attempts ?? 0) <= config.formRateLimitAttempts;
}

export async function clearExpiredFormRateLimits() {
  await sql`
    delete from form_submission_attempts
    where window_started < now() - make_interval(secs => ${config.formRateLimitWindowSeconds * 2})
  `;
}
