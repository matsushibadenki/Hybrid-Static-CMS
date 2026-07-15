import { config } from "./config";
import type { FormRecord } from "./types";

type SmtpState = {
  buffer: string;
  responseLines: string[];
  waiters: Array<(response: string) => void>;
  rejecters: Array<(error: Error) => void>;
};

function encodeBase64(value: string) {
  return Buffer.from(value, "utf8").toString("base64");
}

function headerValue(value: string) {
  return value.replace(/[\r\n]/g, " ").trim();
}

function messageBody(form: FormRecord, payload: Record<string, string>) {
  return [
    `Form: ${form.title}`,
    `Slug: ${form.slug}`,
    "",
    ...form.fields.map((field) => `${field.label}: ${payload[field.name] ?? ""}`),
  ].join("\r\n");
}

function nextResponse(state: SmtpState) {
  return new Promise<string>((resolve, reject) => {
    state.waiters.push(resolve);
    state.rejecters.push(reject);
  });
}

function deliverResponse(state: SmtpState, response: string) {
  const resolve = state.waiters.shift();
  state.rejecters.shift();
  resolve?.(response);
}

function failResponses(state: SmtpState, error: Error) {
  const rejecters = state.rejecters.splice(0);
  state.waiters.splice(0);
  for (const reject of rejecters) reject(error);
}

async function expectResponse(state: SmtpState, socket: Bun.Socket, command: string, expected: number) {
  socket.write(`${command}\r\n`);
  const response = await nextResponse(state);
  const code = Number(response.slice(0, 3));
  if (code !== expected) {
    throw new Error(`SMTP command failed with ${code}: ${response.trim().slice(0, 200)}`);
  }
}

export function formEmailNotificationsEnabled() {
  return Boolean(config.smtpHost && config.formNotificationEmail && config.smtpFrom);
}

export async function sendFormSubmissionEmail(form: FormRecord, payload: Record<string, string>) {
  if (!formEmailNotificationsEnabled()) {
    return { sent: false, skipped: true };
  }

  const state: SmtpState = { buffer: "", responseLines: [], waiters: [], rejecters: [] };
  const socket = await Bun.connect({
    hostname: config.smtpHost!,
    port: config.smtpPort,
    tls: config.smtpTls,
    socket: {
      data(_socket, data) {
        state.buffer += new TextDecoder().decode(data);
        const lines = state.buffer.split("\r\n");
        state.buffer = lines.pop() ?? "";
        for (const line of lines) {
          state.responseLines.push(line);
          if (/^\d{3} /.test(line)) {
            deliverResponse(state, `${state.responseLines.join("\r\n")}\r\n`);
            state.responseLines.length = 0;
          }
        }
      },
      error(_socket, error) {
        failResponses(state, error instanceof Error ? error : new Error("SMTP socket error"));
      },
      close() {
        failResponses(state, new Error("SMTP connection closed unexpectedly"));
      },
      connectError(_socket, error) {
        failResponses(state, error instanceof Error ? error : new Error("SMTP connection failed"));
      },
    },
  });

  try {
    const greeting = await nextResponse(state);
    if (Number(greeting.slice(0, 3)) !== 220) throw new Error(`SMTP greeting failed: ${greeting.trim().slice(0, 200)}`);
    await expectResponse(state, socket, `EHLO ${config.smtpHostname}`, 250);
    if (config.smtpUsername && config.smtpPassword) {
      await expectResponse(state, socket, "AUTH LOGIN", 334);
      await expectResponse(state, socket, encodeBase64(config.smtpUsername), 334);
      await expectResponse(state, socket, encodeBase64(config.smtpPassword), 235);
    }
    await expectResponse(state, socket, `MAIL FROM:<${headerValue(config.smtpFrom!)}>`, 250);
    await expectResponse(state, socket, `RCPT TO:<${headerValue(config.formNotificationEmail!)}>`, 250);
    socket.write("DATA\r\n");
    const dataReady = await nextResponse(state);
    if (Number(dataReady.slice(0, 3)) !== 354) throw new Error(`SMTP DATA failed: ${dataReady.trim().slice(0, 200)}`);
    const body = messageBody(form, payload).replace(/^\./gm, "..");
    socket.write([
      `From: ${headerValue(config.smtpFrom!)}`,
      `To: ${headerValue(config.formNotificationEmail!)}`,
      `Subject: [${headerValue(config.appName)}] ${headerValue(form.title)}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      body,
      ".",
      "",
    ].join("\r\n"));
    await nextResponse(state).then((response) => {
      if (Number(response.slice(0, 3)) !== 250) throw new Error(`SMTP message failed: ${response.trim().slice(0, 200)}`);
    });
    await expectResponse(state, socket, "QUIT", 221);
    return { sent: true, skipped: false };
  } finally {
    socket.end();
  }
}
