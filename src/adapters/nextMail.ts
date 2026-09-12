import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";
import path from "node:path";
import { createPostgresMailReceiptStore, type MailReceiptStore } from "./mailReceiptStore";

type Message = { from: string; to: string; subject: string; text: string };
type Sender = (message: Message) => Promise<unknown>;
type Environment = Record<string, string | undefined>;

export function createMailRoute(env: Environment = process.env, sender?: Sender, fetcher: typeof fetch = fetch, receipts?: MailReceiptStore) {
  const receiptStore = receipts ?? (env.MAIL_ADAPTER_DATABASE_URL ? createPostgresMailReceiptStore(env.MAIL_ADAPTER_DATABASE_URL) : undefined);
  const token = env.MAIL_ADAPTER_TOKEN ?? "";
  const previousToken = env.MAIL_ADAPTER_PREVIOUS_TOKEN;
  const signingSecret = env.MAIL_ADAPTER_SIGNING_SECRET;
  const previousSecret = env.MAIL_ADAPTER_PREVIOUS_SIGNING_SECRET;
  if ([previousToken, signingSecret, previousSecret].some((value) => value !== undefined && value !== "" && value.length < 32) || (previousSecret && !signingSecret)) {
    throw new Error("Rotation and signing secrets must contain at least 32 characters and require an active signing secret.");
  }
  const from = env.MAIL_ADAPTER_FROM ?? "";
  const to = env.MAIL_ADAPTER_TO ?? "";
  const mailbox = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/;
  if (token.length < 32 || !mailbox.test(from) || !mailbox.test(to)) {
    throw new Error("Configure MAIL_ADAPTER_TOKEN (at least 32 characters), MAIL_ADAPTER_FROM and MAIL_ADAPTER_TO.");
  }
  let deliver = sender;
  const mode = env.MAIL_ADAPTER_MODE ?? "smtp";
  if (!["smtp", "sendmail", "http", "disabled"].includes(mode)) throw new Error("Invalid MAIL_ADAPTER_MODE.");
  if (!deliver && mode === "sendmail") {
    const executable = env.MAIL_ADAPTER_SENDMAIL_PATH ?? "/usr/sbin/sendmail";
    if (!path.isAbsolute(executable) || /[\0\r\n]/.test(executable)) throw new Error("An absolute sendmail path is required.");
    const transport = nodemailer.createTransport({ sendmail: true, path: executable, newline: "unix", disableFileAccess: true, disableUrlAccess: true });
    deliver = (message) => transport.sendMail(message);
  }
  if (!deliver && mode === "http") {
    const url = new URL(env.MAIL_ADAPTER_API_URL ?? "");
    const apiToken = env.MAIL_ADAPTER_API_TOKEN;
    if (url.protocol !== "https:" || url.username || url.password || !apiToken) throw new Error("An HTTPS API URL and API token are required.");
    deliver = async (message) => {
      const response = await fetcher(url, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(8000),
        headers: { "content-type": "application/json", authorization: `Bearer ${apiToken}` },
        body: JSON.stringify(message),
      });
      await response.body?.cancel();
      if (!response.ok) throw new Error("Mail provider rejected the request.");
    };
  }
  if (!deliver && mode === "smtp") {
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
    const authorization = digest(request.headers.get("authorization") ?? "");
    const currentMatches = timingSafeEqual(authorization, digest(`Bearer ${token}`));
    const previousMatches = previousToken ? timingSafeEqual(authorization, digest(`Bearer ${previousToken}`)) : false;
    if (!currentMatches && !previousMatches) return respond(401);
    if (mode === "disabled") return respond(503);
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
      const raw = Buffer.concat(chunks);
      if (signingSecret) {
        const timestamp = request.headers.get("x-hsc-mail-timestamp") ?? "";
        const signature = request.headers.get("x-hsc-mail-signature") ?? "";
        if (!/^\d{10,11}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 || !/^[a-f0-9]{64}$/.test(signature)) return respond(401);
        const supplied = Buffer.from(signature, "hex");
        const matches = [signingSecret, previousSecret].filter(Boolean).map((secret) =>
          timingSafeEqual(supplied, createHmac("sha256", secret!).update(`${timestamp}.`).update(raw).digest()));
        if (!matches.some(Boolean)) return respond(401);
      }
      value = JSON.parse(raw.toString("utf8"));
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
    const mail = { from, to, subject: message.subject, text: message.text };
    const deliveryId = message.deliveryId;
    if (receiptStore) {
      if (typeof deliveryId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(deliveryId)) return respond(400);
      try {
        const claim = await receiptStore.claim(deliveryId, digest(JSON.stringify(mail)).toString("hex"));
        if (claim === "sent") return respond(204);
        if (claim === "blocked") return respond(409);
      } catch {
        return respond(503);
      }
    }
    try {
      // Pass only the supported fields, never arbitrary Nodemailer options.
      await deliver!(mail);
      if (receiptStore) await receiptStore.complete(deliveryId as string);
      return respond(204);
    } catch {
      return respond(receiptStore ? 409 : 502);
    }
  };
}
