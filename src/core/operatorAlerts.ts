import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config";
import { createLogRecord, logLevelEnabled, logWarn, sanitizeLogContext, writeLog, type LogContext, type LogLevel } from "./logger";

export type OperatorAlertInput = {
  level: LogLevel;
  action: string;
  message: string;
  context?: LogContext;
};

export type OperatorAlertDeliverySettings = {
  webhookUrl: string | null;
  webhookSecret: string | null;
  minimumLevel: LogLevel;
  timeoutMs: number;
};

export function isAllowedAlertWebhookUrl(value: string | null) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1" || url.hostname === "[::1]"));
  } catch {
    return false;
  }
}

export function signOperatorAlert(timestamp: string, body: string, secret: string) {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

export function verifyOperatorAlertSignature(timestamp: string, body: string, secret: string, signature: string) {
  const expected = Buffer.from(signOperatorAlert(timestamp, body, secret));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function buildOperatorAlertBody(input: OperatorAlertInput, timestamp = new Date()) {
  return JSON.stringify({
    version: 1,
    ...createLogRecord(input.level, input.action, input.message, sanitizeLogContext(input.context), timestamp),
  });
}

export async function sendOperatorAlert(
  input: OperatorAlertInput,
  fetcher: typeof fetch = fetch,
  settings: OperatorAlertDeliverySettings = {
    webhookUrl: config.operatorAlertWebhookUrl,
    webhookSecret: config.operatorAlertWebhookSecret,
    minimumLevel: config.operatorAlertMinLevel,
    timeoutMs: config.operatorAlertTimeoutMs,
  },
) {
  if (!settings.webhookUrl || !logLevelEnabled(input.level, settings.minimumLevel)) {
    return { sent: false, skipped: true };
  }
  if (!isAllowedAlertWebhookUrl(settings.webhookUrl)) {
    throw new Error("OPERATOR_ALERT_WEBHOOK_URL must use HTTPS, except for localhost testing.");
  }

  const timestamp = new Date().toISOString();
  const body = buildOperatorAlertBody(input, new Date(timestamp));
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "Hybrid-Static-CMS-Operator-Alert/1",
    "x-hscms-timestamp": timestamp,
  };
  if (settings.webhookSecret) {
    headers["x-hscms-signature"] = signOperatorAlert(timestamp, body, settings.webhookSecret);
  }

  const response = await fetcher(settings.webhookUrl, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(settings.timeoutMs),
  });
  if (!response.ok) throw new Error(`Operator alert webhook returned HTTP ${response.status}.`);
  return { sent: true, skipped: false };
}

export async function reportOperationalEvent(input: OperatorAlertInput) {
  writeLog(input.level, input.action, input.message, input.context);
  try {
    return await sendOperatorAlert(input);
  } catch (error) {
    logWarn("operator_alert.delivery_failed", "Operator alert webhook delivery failed.", {
      action: input.action,
      error,
    });
    return { sent: false, skipped: false };
  }
}
