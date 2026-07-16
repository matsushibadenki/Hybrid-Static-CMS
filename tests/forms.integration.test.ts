import { describe, expect, test } from "bun:test";
import { createApp } from "../src/server/app";
import { sql } from "../src/core/db";

const app = createApp();
const slug = `integration-form-${crypto.randomUUID()}`;
let formId: number | null = null;

describe.skipIf(process.env.RUN_DB_INTEGRATION_TESTS !== "true")("form submission integration", () => {
  test("creates a published form, accepts a public submission, and stores its payload", async () => {
    try {
      const formRows = await sql`
        insert into forms (title, slug, status, submit_label, success_message)
        values ('Integration Form', ${slug}, 'published', 'Send', 'Received')
        returning id
      `;
      formId = Number(formRows[0].id);
      await sql`
        insert into form_fields (form_id, name, label, field_type, required, sort_order)
        values (${formId}, 'message', 'Message', 'text', true, 0)
      `;

      const body = new FormData();
      body.set("message", "integration payload");
      const response = await app.request(`http://localhost/cms-api/forms/${slug}/submit`, { method: "POST", body });
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("Received");

      const submissions = await sql`
        select payload_json
        from form_submissions
        where form_id = ${formId}
      `;
      expect(submissions).toHaveLength(1);
      expect(submissions[0].payload_json).toEqual({ message: "integration payload" });
    } finally {
      if (formId) await sql`delete from forms where id = ${formId}`;
    }
  });
});
