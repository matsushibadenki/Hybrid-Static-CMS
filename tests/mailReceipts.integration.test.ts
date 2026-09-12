import { describe, expect, test } from "bun:test";
import { sql } from "../src/core/db";
import { createMailRoute } from "../src/adapters/nextMail";
import { createPostgresMailReceiptStore } from "../src/adapters/mailReceiptStore";

describe.skipIf(process.env.RUN_DB_INTEGRATION_TESTS !== "true")("shared mail receipts", () => {
  test("deduplicates across gateway instances and blocks changed or ambiguous deliveries", async () => {
    await sql.unsafe(await Bun.file(new URL("../examples/next-mail/receipts.sql", import.meta.url)).text());
    const id = crypto.randomUUID();
    const failedId = crypto.randomUUID();
    const env = { MAIL_ADAPTER_TOKEN: "test-authorization-".repeat(3), MAIL_ADAPTER_FROM: "cms@example.test", MAIL_ADAPTER_TO: "owner@example.test" };
    const store1 = createPostgresMailReceiptStore(process.env.DATABASE_URL!);
    const store2 = createPostgresMailReceiptStore(process.env.DATABASE_URL!);
    const request = (deliveryId = id, text = "Hello") => new Request("https://gateway.example.test", {
      method: "POST", headers: { authorization: `Bearer ${env.MAIL_ADAPTER_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ deliveryId, from: env.MAIL_ADAPTER_FROM, to: env.MAIL_ADAPTER_TO, subject: "Test", text }),
    });
    let sent = 0;
    const sender = async () => { sent++; };
    const first = createMailRoute(env, sender, fetch, store1);
    const second = createMailRoute(env, sender, fetch, store2);
    try {
      const responses = await Promise.all([first(request()), second(request())]);
      expect(responses.some((response) => response.status === 204)).toBe(true);
      expect(sent).toBe(1);
      expect((await second(request())).status).toBe(204);
      expect((await second(request(id, "Changed"))).status).toBe(409);
      expect(sent).toBe(1);
      const failing = createMailRoute(env, async () => { throw new Error("SMTP response lost"); }, fetch, store1);
      expect((await failing(request(failedId))).status).toBe(409);
      expect((await second(request(failedId))).status).toBe(409);
      expect(sent).toBe(1);
    } finally {
      await sql`delete from mail_delivery_receipts where delivery_id in (${id}, ${failedId})`;
    }
  });
});
