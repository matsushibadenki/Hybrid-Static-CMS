import { createHash, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";

type Message = { from: string; to: string; subject: string; text: string };
type Sender = (message: Message) => Promise<unknown>;
type Environment = Record<string, string | undefined>;

export function createMailRoute(env: Environment = process.env, sender?: Sender) {
  const token = env.MAIL_ADAPTER_TOKEN ?? "";
  const from = env.MAIL_ADAPTER_FROM ?? "";
  const to = env.MAIL_ADAPTER_TO ?? "";
  const mailbox = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/;
  if (token.length < 32 || !mailbox.test(from) || !mailbox.test(to)) {
    throw new Error("Configure MAIL_ADAPTER_TOKEN (at least 32 characters), MAIL_ADAPTER_FROM and MAIL_ADAPTER_TO.");
  }
  let deliver = sender;
  if (!deliver) {
    const port = Number(env.MAIL_ADAPTER_SMTP_PORT ?? 587);
    if (!env.MAIL_ADAPTER_SMTP_HOST || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("Configure a valid adapter SMTP host and port.");
    }
    if (Boolean(env.MAIL_ADAPTER_SMTP_USER) !== Boolean(env.MAIL_ADAPTER_SMTP_PASSWORD)) {
      throw new Error("SMTP username and password must be configured together.");
    }
    const transport = nodemailer.createTransport({
      host: env.MAIL_ADAPTER_SMTP_HOST,
      port,
      secure: port === 465,
      requireTLS: port !== 465,
      auth: env.MAIL_ADAPTER_SMTP_USER ? { user: env.MAIL_ADAPTER_SMTP_USER, pass: env.MAIL_ADAPTER_SMTP_PASSWORD! } : undefined,
      connectionTimeout: 3000,
      greetingTimeout: 3000,
      socketTimeout: 5000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    deliver = (message) => transport.sendMail(message);
  }
  const digest = (value: string) => createHash("sha256").update(value).digest();
  const respond = (status: number) => new Response(null, { status, headers: { "cache-control": "no-store" } });
  return async (request: Request) => {
    if (request.method !== "POST") return respond(405);
    if (!timingSafeEqual(digest(request.headers.get("authorization") ?? ""), digest(`Bearer ${token}`))) return respond(401);
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return respond(415);
    if (!request.body) return respond(400);
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    let value: unknown;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 65536) {
          await reader.cancel();
          return respond(413);
        }
        chunks.push(chunk.value);
      }
      value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return respond(400);
    } finally {
      reader.releaseLock();
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) return respond(400);
    const message = value as Record<string, unknown>;
    if (message.from !== from || message.to !== to) return respond(403);
    if (typeof message.subject !== "string" || message.subject.length > 300 || /[\r\n\0]/.test(message.subject) ||
        typeof message.text !== "string" || message.text.length > 60000) return respond(400);
    try {
      // Pass only the supported fields, never arbitrary Nodemailer options.
      await deliver!({ from, to, subject: message.subject, text: message.text });
      return respond(204);
    } catch {
      return respond(502);
    }
  };
}
