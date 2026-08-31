import path from "node:path";
import { config, type MailDeliveryMode } from "./config";
import type { FormRecord } from "./types";

type SmtpState = { buffer: string; responseLines: string[]; waiters: Array<(response: string) => void>; rejecters: Array<(error: Error) => void> };
export type MailMessage = { from: string; to: string; subject: string; text: string };
export type MailDeliverySettings = {
  mode: MailDeliveryMode; smtpHost: string | null; smtpPort: number; smtpTls: boolean; smtpHostname: string; smtpUsername: string | null; smtpPassword: string | null;
  httpApiUrl: string | null; httpApiToken: string | null; sendmailPath: string; sendmailArgs: string[];
};

function encodeBase64(value: string) { return Buffer.from(value, "utf8").toString("base64"); }
function headerValue(value: string) { return value.replace(/[\r\n]/g, " ").trim(); }
function messageBody(form: FormRecord, payload: Record<string, string>) {
  return [`Form: ${form.title}`, `Slug: ${form.slug}`, "", ...form.fields.map((field) => `${field.label}: ${payload[field.name] ?? ""}`)].join("\r\n");
}
function nextResponse(state: SmtpState) { return new Promise<string>((resolve, reject) => { state.waiters.push(resolve); state.rejecters.push(reject); }); }
function deliverResponse(state: SmtpState, response: string) { const resolve = state.waiters.shift(); state.rejecters.shift(); resolve?.(response); }
function failResponses(state: SmtpState, error: Error) { const rejecters = state.rejecters.splice(0); state.waiters.splice(0); for (const reject of rejecters) reject(error); }
async function expectResponse(state: SmtpState, socket: Bun.Socket, command: string, expected: number) {
  socket.write(`${command}\r\n`);
  const response = await nextResponse(state);
  const code = Number(response.slice(0, 3));
  if (code !== expected) throw new Error(`SMTP command failed with ${code}: ${response.trim().slice(0, 200)}`);
}
function rfc822Message(message: MailMessage) {
  return [`From: ${headerValue(message.from)}`, `To: ${headerValue(message.to)}`, `Subject: ${headerValue(message.subject)}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", message.text.replace(/\r?\n/g, "\r\n").replace(/^\./gm, ".."), ""].join("\r\n");
}
function defaultSettings(): MailDeliverySettings {
  return { mode: config.mailDeliveryMode, smtpHost: config.smtpHost, smtpPort: config.smtpPort, smtpTls: config.smtpTls, smtpHostname: config.smtpHostname, smtpUsername: config.smtpUsername, smtpPassword: config.smtpPassword, httpApiUrl: config.mailHttpApiUrl, httpApiToken: config.mailHttpApiToken, sendmailPath: config.mailSendmailPath, sendmailArgs: config.mailSendmailArgs };
}

export function isAllowedMailHttpApiUrl(value: string | null) {
  if (!value) return false;
  try { const url = new URL(value); return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)); } catch { return false; }
}
export function isAllowedSendmailPath(value: string) { return path.isAbsolute(value) && !value.includes("\0") && value.length <= 512; }
function mailDeliveryConfigured(settings: MailDeliverySettings) {
  if (settings.mode === "disabled") return false;
  if (settings.mode === "smtp") return Boolean(settings.smtpHost);
  if (settings.mode === "sendmail") return isAllowedSendmailPath(settings.sendmailPath);
  return Boolean(settings.httpApiToken && isAllowedMailHttpApiUrl(settings.httpApiUrl));
}
export function formEmailNotificationsEnabled(settings: MailDeliverySettings = defaultSettings()) {
  return Boolean(config.mailFrom && config.mailTo && mailDeliveryConfigured(settings));
}

async function sendSmtpMail(message: MailMessage, settings: MailDeliverySettings) {
  if (!settings.smtpHost) throw new Error("SMTP_HOST is required for SMTP delivery.");
  const state: SmtpState = { buffer: "", responseLines: [], waiters: [], rejecters: [] };
  const socket = await Bun.connect({ hostname: settings.smtpHost, port: settings.smtpPort, tls: settings.smtpTls, socket: {
    data(_socket, data) {
      state.buffer += new TextDecoder().decode(data);
      const lines = state.buffer.split("\r\n"); state.buffer = lines.pop() ?? "";
      for (const line of lines) { state.responseLines.push(line); if (/^\d{3} /.test(line)) { deliverResponse(state, `${state.responseLines.join("\r\n")}\r\n`); state.responseLines.length = 0; } }
    },
    error(_socket, error) { failResponses(state, error instanceof Error ? error : new Error("SMTP socket error")); },
    close() { failResponses(state, new Error("SMTP connection closed unexpectedly")); },
    connectError(_socket, error) { failResponses(state, error instanceof Error ? error : new Error("SMTP connection failed")); },
  } });
  try {
    const greeting = await nextResponse(state);
    if (Number(greeting.slice(0, 3)) !== 220) throw new Error(`SMTP greeting failed: ${greeting.trim().slice(0, 200)}`);
    await expectResponse(state, socket, `EHLO ${settings.smtpHostname}`, 250);
    if (settings.smtpUsername && settings.smtpPassword) {
      await expectResponse(state, socket, "AUTH LOGIN", 334); await expectResponse(state, socket, encodeBase64(settings.smtpUsername), 334); await expectResponse(state, socket, encodeBase64(settings.smtpPassword), 235);
    }
    await expectResponse(state, socket, `MAIL FROM:<${headerValue(message.from)}>`, 250);
    await expectResponse(state, socket, `RCPT TO:<${headerValue(message.to)}>`, 250);
    socket.write("DATA\r\n");
    const dataReady = await nextResponse(state);
    if (Number(dataReady.slice(0, 3)) !== 354) throw new Error(`SMTP DATA failed: ${dataReady.trim().slice(0, 200)}`);
    socket.write(`${rfc822Message(message)}.\r\n`);
    await nextResponse(state).then((response) => { if (Number(response.slice(0, 3)) !== 250) throw new Error(`SMTP message failed: ${response.trim().slice(0, 200)}`); });
    await expectResponse(state, socket, "QUIT", 221);
  } finally { socket.end(); }
}
async function sendSendmailMessage(message: MailMessage, settings: MailDeliverySettings) {
  if (!isAllowedSendmailPath(settings.sendmailPath)) throw new Error("MAIL_SENDMAIL_PATH must be an absolute path.");
  const process = Bun.spawn([settings.sendmailPath, ...settings.sendmailArgs, "-f", headerValue(message.from), headerValue(message.to)], { stdin: new Blob([rfc822Message(message)]), stdout: "ignore", stderr: "ignore" });
  if (await process.exited !== 0) throw new Error("Local sendmail command failed.");
}
async function sendHttpApiMessage(message: MailMessage, settings: MailDeliverySettings, fetcher: typeof fetch) {
  if (!isAllowedMailHttpApiUrl(settings.httpApiUrl) || !settings.httpApiToken) throw new Error("MAIL_HTTP_API_URL and MAIL_HTTP_API_TOKEN are required for HTTP mail delivery.");
  const response = await fetcher(settings.httpApiUrl!, { method: "POST", headers: { authorization: `Bearer ${settings.httpApiToken}`, "content-type": "application/json", "user-agent": "Hybrid-Static-CMS-Mail/1" }, body: JSON.stringify(message), signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Mail API returned HTTP ${response.status}.`);
}
export async function sendMail(message: MailMessage, fetcher: typeof fetch = fetch, settings: MailDeliverySettings = defaultSettings()) {
  if (!mailDeliveryConfigured(settings)) return { sent: false, skipped: true };
  if (settings.mode === "smtp") await sendSmtpMail(message, settings);
  else if (settings.mode === "sendmail") await sendSendmailMessage(message, settings);
  else if (settings.mode === "http") await sendHttpApiMessage(message, settings, fetcher);
  return { sent: true, skipped: false };
}
export async function sendFormSubmissionEmail(form: FormRecord, payload: Record<string, string>) {
  if (!config.mailFrom || !config.mailTo) return { sent: false, skipped: true };
  return sendMail({ from: config.mailFrom, to: config.mailTo, subject: `[${headerValue(config.appName)}] ${headerValue(form.title)}`, text: messageBody(form, payload) });
}
