import { expect, test } from "bun:test";
import { createMailRoute } from "../src/adapters/nextMail";

const env = { MAIL_ADAPTER_TOKEN: "test-token-".repeat(4), MAIL_ADAPTER_FROM: "cms@example.test", MAIL_ADAPTER_TO: "owner@example.test" };
const message = { from: env.MAIL_ADAPTER_FROM, to: env.MAIL_ADAPTER_TO, subject: "Notification", text: "Message" };
function request(value: unknown, token = env.MAIL_ADAPTER_TOKEN) {
  return new Request("https://mail.example.test/api/cms-mail", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(value) });
}

test("mail route restricts authorization and recipients and strips unsupported options", async () => {
  const sent: unknown[] = [];
  const route = createMailRoute(env, async (value) => { sent.push(value); });
  expect((await route(request(message, "wrong"))).status).toBe(401);
  expect((await route(request({ ...message, to: "other@example.test" }))).status).toBe(403);
  expect((await route(request({ ...message, subject: "a\r\nBcc: other@example.test" }))).status).toBe(400);
  expect((await route(request({ ...message, text: "a".repeat(70000) }))).status).toBe(413);
  expect(sent).toHaveLength(0);
  expect((await route(request({ ...message, attachments: [{ path: "/private/file" }] }))).status).toBe(204);
  expect(sent).toEqual([message]);
});

test("mail route fails closed and hides SMTP error details", async () => {
  expect(() => createMailRoute({})).toThrow();
  const route = createMailRoute(env, async () => { throw new Error("private credentials"); });
  const response = await route(request(message));
  expect(response.status).toBe(502);
  expect(await response.text()).toBe("");
});
