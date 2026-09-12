import { describe, expect, test } from "bun:test";
import { sql } from "../src/core/db";
import { processMailOutbox, reviewMailDelivery } from "../src/core/mailOutbox";
import { createUser } from "../src/core/auth";

describe.skipIf(process.env.RUN_DB_INTEGRATION_TESTS !== "true")("mail outbox", () => {
  test("retries failed delivery, records success, and isolates stale claims", async () => {
    const forms = await sql`insert into forms (title, slug, status, submit_label, success_message)
      values ('Outbox', ${crypto.randomUUID()}, 'published', 'Send', 'OK') returning id`;
    const formId = Number(forms[0].id);
    try {
      const submissions = await sql`insert into form_submissions (form_id, payload_json) values (${formId}, '{}') returning id`;
      const jobs = await sql`insert into mail_outbox (submission_id, run_after) values (${submissions[0].id}, '2000-01-01') returning id`;
      const id = Number(jobs[0].id);
      await processMailOutbox(async () => { throw new Error("fixture"); });
      let rows = await sql`select status, attempts, run_after > now() as delayed from mail_outbox where id = ${id}`;
      expect(rows[0].status).toBe("queued");
      expect(rows[0].attempts).toBe(1);
      expect(rows[0].delayed).toBe(true);
      await sql`update mail_outbox set run_after = '2000-01-01' where id = ${id}`;
      await processMailOutbox(async () => ({ sent: true, skipped: false }));
      rows = await sql`select status from mail_outbox where id = ${id}`;
      expect(rows[0].status).toBe("sent");
      await sql`update mail_outbox set status = 'running', updated_at = now() - interval '20 minutes' where id = ${id}`;
      await processMailOutbox(async () => { throw new Error("Must not resend stale claim"); });
      rows = await sql`select status from mail_outbox where id = ${id}`;
      expect(rows[0].status).toBe("uncertain");
      const actor = await createUser({ email: `mail-review-${crypto.randomUUID()}@example.test`, password: "integration-password-123", displayName: "Mail reviewer", roles: ["owner"] });
      try {
        const results = await Promise.all([reviewMailDelivery(id, "retry", actor), reviewMailDelivery(id, "retry", actor)]);
        expect(results.filter(Boolean)).toHaveLength(1);
        expect(await reviewMailDelivery(id, "confirm", actor)).toBe(false);
        const logs = await sql`select id from audit_logs where actor_user_id = ${actor} and action = 'mail.review.retry'`;
        expect(logs).toHaveLength(1);
        await sql`update mail_outbox set status = 'failed' where id = ${id}`;
        expect(await reviewMailDelivery(id, "confirm", actor)).toBe(true);
        expect(await reviewMailDelivery(id, "retry", actor)).toBe(false);
      } finally {
        await sql`delete from users where id = ${actor}`;
      }
    } finally {
      await sql`delete from forms where id = ${formId}`;
    }
  });
});
