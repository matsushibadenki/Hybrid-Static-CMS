import { describe, expect, test } from "bun:test";
import {
  buildOperatorAlertBody,
  isAllowedAlertWebhookUrl,
  sendOperatorAlert,
  signOperatorAlert,
  verifyOperatorAlertSignature,
} from "../src/core/operatorAlerts";

describe("operator alert webhooks", () => {
  test("requires HTTPS except for local development receivers", () => {
    expect(isAllowedAlertWebhookUrl("https://alerts.example.test/hybrid-static-cms")).toBe(true);
    expect(isAllowedAlertWebhookUrl("http://localhost:4000/alerts")).toBe(true);
    expect(isAllowedAlertWebhookUrl("http://127.0.0.1:4000/alerts")).toBe(true);
    expect(isAllowedAlertWebhookUrl("http://alerts.example.test/hook")).toBe(false);
    expect(isAllowedAlertWebhookUrl("file:///tmp/alerts")).toBe(false);
    expect(isAllowedAlertWebhookUrl("not a url")).toBe(false);
  });

  test("signs the timestamp and exact body with HMAC SHA-256", () => {
    const timestamp = "2026-07-29T00:00:00.000Z";
    const body = '{"level":"error"}';
    const signature = signOperatorAlert(timestamp, body, "webhook-secret");
    expect(signature).toStartWith("sha256=");
    expect(verifyOperatorAlertSignature(timestamp, body, "webhook-secret", signature)).toBe(true);
    expect(verifyOperatorAlertSignature(timestamp, `${body} `, "webhook-secret", signature)).toBe(false);
  });

  test("uses the structured log envelope and redacts context", () => {
    const body = buildOperatorAlertBody({
      level: "error",
      action: "smtp.delivery_failed",
      message: "Delivery failed",
      context: { password: "private", attempt: 2 },
    }, new Date("2026-07-29T00:00:00.000Z"));
    const payload = JSON.parse(body);
    expect(payload.version).toBe(1);
    expect(payload.event).toBe("smtp.delivery_failed");
    expect(payload.context.password).toBe("[REDACTED]");
    expect(payload.context.attempt).toBe(2);
  });

  test("delivers the signed JSON contract without external network access", async () => {
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
      requestUrl = String(input);
      requestInit = init;
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    const result = await sendOperatorAlert({
      level: "error",
      action: "scheduler.run_failed",
      message: "Scheduled maintenance failed.",
      context: { password: "private" },
    }, fetcher, {
      webhookUrl: "https://alerts.example.test/hook",
      webhookSecret: "delivery-secret",
      minimumLevel: "error",
      timeoutMs: 1_000,
    });

    expect(result).toEqual({ sent: true, skipped: false });
    expect(requestUrl).toBe("https://alerts.example.test/hook");
    expect(requestInit?.method).toBe("POST");
    const headers = new Headers(requestInit?.headers);
    const body = String(requestInit?.body);
    const timestamp = headers.get("x-hscms-timestamp") ?? "";
    expect(headers.get("content-type")).toBe("application/json");
    expect(verifyOperatorAlertSignature(timestamp, body, "delivery-secret", headers.get("x-hscms-signature") ?? "")).toBe(true);
    expect(body).not.toContain("private");
  });
});
