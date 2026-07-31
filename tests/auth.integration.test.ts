import { describe, expect, test } from "bun:test";
import { createApp } from "../src/server/app";
import { createUser } from "../src/core/auth";
import { confirmTotpEnrollment, startTotpEnrollment } from "../src/core/accountSecurity";
import { sql } from "../src/core/db";
import { generateTotpCode } from "../src/core/security";

const app = createApp();
const email = `integration-${crypto.randomUUID()}@example.test`;
let userId: number | null = null;

describe.skipIf(process.env.RUN_DB_INTEGRATION_TESTS !== "true")("authentication integration", () => {
  test("logs in and reaches the protected control panel", async () => {
    try {
      userId = await createUser({
        email,
        password: "integration-password-123",
        displayName: "Integration User",
        roles: ["owner"],
      });

      const body = new FormData();
      body.set("email", email);
      body.set("password", "integration-password-123");
      const login = await app.request("http://localhost/login", { method: "POST", body });
      expect(login.status).toBe(302);
      expect(login.headers.get("location")).toBe("/control-panel");

      const setCookie = login.headers.get("set-cookie") ?? "";
      const cookie = setCookie.match(/^[^;]+/)?.[0];
      expect(cookie).toBeTruthy();

      const dashboard = await app.request("http://localhost/control-panel", {
        headers: { Cookie: cookie ?? "" },
      });
      expect(dashboard.status).toBe(200);
      expect(await dashboard.text()).toContain("Dashboard");

      const editor = await app.request("http://localhost/control-panel/posts/new", {
        headers: { Cookie: cookie ?? "" },
      });
      expect(editor.status).toBe(200);
      const editorHtml = await editor.text();
      expect(editorHtml).toContain("data-autosave-form");
      const autosaveKey = editorHtml.match(/name="autosaveKey" value="([^"]+)"/)?.[1] ?? "";
      const csrfToken = editorHtml.match(/name="_csrf" value="([^"]+)"/)?.[1] ?? "";
      expect(autosaveKey).toMatch(/^new-/);
      expect(csrfToken).toBeTruthy();

      const autosaveUrl = `http://localhost/control-panel/posts/autosave/${autosaveKey}`;
      const saved = await app.request(autosaveUrl, {
        method: "POST",
        headers: {
          Cookie: cookie ?? "",
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ payload: { title: "Recovered through route", bodyMd: "Draft body" } }),
      });
      expect(saved.status).toBe(200);
      const recovered = await app.request(autosaveUrl, { headers: { Cookie: cookie ?? "" } });
      expect(recovered.status).toBe(200);
      expect((await recovered.json()).autosave.payload.title).toBe("Recovered through route");

      const discarded = await app.request(`${autosaveUrl}/delete`, {
        method: "POST",
        headers: { Cookie: cookie ?? "", "X-CSRF-Token": csrfToken },
      });
      expect(discarded.status).toBe(200);

      const sessions = await sql`
        select id from sessions where user_id = ${userId} order by id desc limit 1
      `;
      const enrollment = await startTotpEnrollment(userId, email, "integration-password-123");
      const code = await generateTotpCode(enrollment.secret);
      const recoveryCodes = await confirmTotpEnrollment(userId, code ?? "", Number(sessions[0].id));
      expect(recoveryCodes).toHaveLength(8);

      const missingCode = new FormData();
      missingCode.set("email", email);
      missingCode.set("password", "integration-password-123");
      expect((await app.request("http://localhost/login", { method: "POST", body: missingCode })).status).toBe(401);

      const recoveryLogin = new FormData();
      recoveryLogin.set("email", email);
      recoveryLogin.set("password", "integration-password-123");
      recoveryLogin.set("twoFactorCode", recoveryCodes[0]);
      expect((await app.request("http://localhost/login", { method: "POST", body: recoveryLogin })).status).toBe(302);

      const reusedRecoveryLogin = new FormData();
      reusedRecoveryLogin.set("email", email);
      reusedRecoveryLogin.set("password", "integration-password-123");
      reusedRecoveryLogin.set("twoFactorCode", recoveryCodes[0]);
      expect((await app.request("http://localhost/login", { method: "POST", body: reusedRecoveryLogin })).status).toBe(401);
    } finally {
      if (userId) await sql`delete from users where id = ${userId}`;
    }
  });
});
