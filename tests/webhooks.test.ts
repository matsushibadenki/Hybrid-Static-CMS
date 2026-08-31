import { describe, expect, test } from "bun:test";
import {
  buildOutboundWebhookBody,
  isAllowedOutboundWebhookUrl,
  sendOutboundWebhook,
  verifyOutboundWebhookSignature,
} from "../src/core/webhooks";

describe("outbound webhooks", () => {
  test("requires HTTPS except for local development receivers", () => {
    expect(isAllowedOutboundWebhookUrl("https://automation.example.test/hook")).toBe(true);
    expect(isAllowedOutboundWebhookUrl("http://localhost:4010/hook")).toBe(true);
    expect(isAllowedOutboundWebhookUrl("http://automation.example.test/hook")).toBe(false);
    expect(isAllowedOutboundWebhookUrl("file:///tmp/hook")).toBe(false);
  });

  test("builds privacy-safe event bodies", () => {
    const body = buildOutboundWebhookBody({
      event: "form.submitted",
      action: "form.submit",
      resource: "form",
      resourceId: 42,
      occurredAt: "2026-08-31T00:00:00.000Z",
    });
    expect(JSON.parse(body)).toEqual({
      version: 1,
      event: "form.submitted",
      action: "form.submit",
      occurredAt: "2026-08-31T00:00:00.000Z",
      resource: { type: "form", id: "42" },
    });
    expect(body).not.toContain("email");
    expect(body).not.toContain("payload");
  });

  test("delivers a signed event envelope without external network access", async () => {
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
      requestUrl = String(input);
      requestInit = init;
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    const result = await sendOutboundWebhook({
      event: "publishing.completed",
      action: "publishing.render",
      resource: "public_output",
      occurredAt: "2026-08-31T00:00:00.000Z",
    }, fetcher, {
      webhookUrl: "https://automation.example.test/hook",
      webhookSecret: "delivery-secret",
      timeoutMs: 1_000,
    });
    expect(result).toEqual({ sent: true, skipped: false });
    expect(requestUrl).toBe("https://automation.example.test/hook");
    const headers = new Headers(requestInit?.headers);
    const body = String(requestInit?.body);
    expect(headers.get("x-hscms-event")).toBe("publishing.completed");
    expect(verifyOutboundWebhookSignature(headers.get("x-hscms-timestamp") ?? "", body, "delivery-secret", headers.get("x-hscms-signature") ?? "")).toBe(true);
  });
});
