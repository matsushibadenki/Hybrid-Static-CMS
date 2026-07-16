import { describe, expect, test } from "bun:test";
import { createApp } from "../src/server/app";
import { createUser } from "../src/core/auth";
import { sql } from "../src/core/db";

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
    } finally {
      if (userId) await sql`delete from users where id = ${userId}`;
    }
  });
});
