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

test("HTTP mode forwards only validated mail with separate provider credentials", async () => {
  let calls = 0;
  const fetcher = (async (_url: unknown, init: RequestInit) => {
    calls++;
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer provider-secret");
    expect(init.redirect).toBe("error");
    expect(JSON.parse(String(init.body))).toEqual(message);
    return new Response(null, { status: 202 });
  }) as typeof fetch;
  const route = createMailRoute({ ...env, MAIL_ADAPTER_MODE: "http", MAIL_ADAPTER_API_URL: "https://provider.example.test/mail", MAIL_ADAPTER_API_TOKEN: "provider-secret" }, undefined, fetcher);
  expect((await route(request(message, "bad"))).status).toBe(401);
  expect(calls).toBe(0);
  expect((await route(request(message))).status).toBe(204);
  expect(calls).toBe(1);
});

test("delivery modes fail closed for invalid settings and disabled delivery", async () => {
  expect(() => createMailRoute({ ...env, MAIL_ADAPTER_MODE: "unknown" })).toThrow();
  expect(() => createMailRoute({ ...env, MAIL_ADAPTER_MODE: "sendmail", MAIL_ADAPTER_SENDMAIL_PATH: "sendmail" })).toThrow();
  expect(() => createMailRoute({ ...env, MAIL_ADAPTER_MODE: "http", MAIL_ADAPTER_API_URL: "http://provider.example.test", MAIL_ADAPTER_API_TOKEN: "secret" })).toThrow();
  const route = createMailRoute({ ...env, MAIL_ADAPTER_MODE: "disabled" });
  expect((await route(request(message))).status).toBe(503);
});
