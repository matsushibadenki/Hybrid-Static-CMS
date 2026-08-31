import { describe, expect, test } from "bun:test";
import { isAllowedMailHttpApiUrl, isAllowedSendmailPath, sendMail, type MailDeliverySettings } from "../src/core/email";

const httpSettings: MailDeliverySettings = {
  mode: "http",
  smtpHost: null,
  smtpPort: 465,
  smtpTls: true,
  smtpHostname: "localhost",
  smtpUsername: null,
  smtpPassword: null,
  httpApiUrl: "https://mail.example.test/send",
  httpApiToken: "mail-api-token",
  sendmailPath: "/usr/sbin/sendmail",
  sendmailArgs: ["-i"],
};

describe("mail delivery adapters", () => {
  test("allows HTTPS mail APIs and only local HTTP development endpoints", () => {
    expect(isAllowedMailHttpApiUrl("https://mail.example.test/send")).toBe(true);
    expect(isAllowedMailHttpApiUrl("http://localhost:3001/send")).toBe(true);
    expect(isAllowedMailHttpApiUrl("http://mail.example.test/send")).toBe(false);
    expect(isAllowedSendmailPath("/usr/sbin/sendmail")).toBe(true);
    expect(isAllowedSendmailPath("sendmail")).toBe(false);
  });

  test("sends the provider-neutral HTTP mail contract without external network access", async () => {
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
      requestUrl = String(input);
      requestInit = init;
      return new Response(null, { status: 202 });
    }) as typeof fetch;
    const result = await sendMail({ from: "cms@example.test", to: "owner@example.test", subject: "New form", text: "Name: Example" }, fetcher, httpSettings);
    expect(result).toEqual({ sent: true, skipped: false });
    expect(requestUrl).toBe("https://mail.example.test/send");
    const headers = new Headers(requestInit?.headers);
    expect(headers.get("authorization")).toBe("Bearer mail-api-token");
    expect(JSON.parse(String(requestInit?.body))).toEqual({ from: "cms@example.test", to: "owner@example.test", subject: "New form", text: "Name: Example" });
  });

  test("skips disabled mail delivery without contacting a provider", async () => {
    const result = await sendMail({ from: "cms@example.test", to: "owner@example.test", subject: "No delivery", text: "Ignored" }, fetch, { ...httpSettings, mode: "disabled" });
    expect(result).toEqual({ sent: false, skipped: true });
  });
});
