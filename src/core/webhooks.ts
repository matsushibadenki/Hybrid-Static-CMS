import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config";
import { logWarn } from "./logger";

export type OutboundWebhookEvent = "publishing.completed" | "content.changed" | "form.submitted" | "media.changed" | "backup.created";

export type OutboundWebhookInput = {
  event: OutboundWebhookEvent;
  action: string;
  resource: string;
  resourceId?: string | number | null;
  occurredAt?: string;
};

export type OutboundWebhookSettings = { webhookUrl: string | null; webhookSecret: string | null; timeoutMs: number };

export function isAllowedOutboundWebhookUrl(value: string | null) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname));
  } catch {
    return false;
  }
}

export function signOutboundWebhook(timestamp: string, body: string, secret: string) {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

export function verifyOutboundWebhookSignature(timestamp: string, body: string, secret: string, signature: string) {
  const expected = Buffer.from(signOutboundWebhook(timestamp, body, secret));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function buildOutboundWebhookBody(input: OutboundWebhookInput, timestamp = input.occurredAt ?? new Date().toISOString()) {
  return JSON.stringify({
    version: 1,
    event: input.event,
    action: input.action,
    occurredAt: timestamp,
    resource: { type: input.resource, id: input.resourceId == null ? null : String(input.resourceId) },
  });
}

export async function sendOutboundWebhook(input: OutboundWebhookInput, fetcher: typeof fetch = fetch, settings: OutboundWebhookSettings = {
  webhookUrl: config.outboundWebhookUrl,
  webhookSecret: config.outboundWebhookSecret,
  timeoutMs: config.outboundWebhookTimeoutMs,
}) {
  if (!settings.webhookUrl) return { sent: false, skipped: true };
  if (!isAllowedOutboundWebhookUrl(settings.webhookUrl)) throw new Error("OUTBOUND_WEBHOOK_URL must use HTTPS, except for localhost testing.");
  const timestamp = input.occurredAt ?? new Date().toISOString();
  const body = buildOutboundWebhookBody(input, timestamp);
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "Hybrid-Static-CMS-Webhook/1", "x-hscms-event": input.event, "x-hscms-timestamp": timestamp };
  if (settings.webhookSecret) headers["x-hscms-signature"] = signOutboundWebhook(timestamp, body, settings.webhookSecret);
  const response = await fetcher(settings.webhookUrl, { method: "POST", headers, body, signal: AbortSignal.timeout(settings.timeoutMs) });
  if (!response.ok) throw new Error(`Outbound webhook returned HTTP ${response.status}.`);
  return { sent: true, skipped: false };
}

function eventForAuditAction(action: string): OutboundWebhookEvent | null {
  if (action === "form.submit") return "form.submitted";
  if (action === "backup.create") return "backup.created";
  if (action.startsWith("media.")) return "media.changed";
  if (action.startsWith("post.") || action.startsWith("page.")) return "content.changed";
  return null;
}

export function notifyAuditWebhook(input: { action: string; targetType: string; targetId?: string | number | null; createdAt?: string }) {
  const event = eventForAuditAction(input.action);
  if (!event) return;
  void sendOutboundWebhook({ event, action: input.action, resource: input.targetType, resourceId: input.targetId ?? null, occurredAt: input.createdAt })
    .catch((error) => logWarn("webhook.delivery_failed", "Outbound webhook delivery failed.", { action: input.action, error }));
}

export function notifyPublishingWebhook() {
  void sendOutboundWebhook({ event: "publishing.completed", action: "publishing.render", resource: "public_output" })
    .catch((error) => logWarn("webhook.delivery_failed", "Outbound webhook delivery failed.", { action: "publishing.render", error }));
}
