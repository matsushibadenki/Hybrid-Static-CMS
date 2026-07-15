import { describe, expect, test } from "bun:test";
import { createApp } from "../src/server/app";

const app = createApp();

describe("application integration smoke tests", () => {
  test("exposes a lightweight liveness endpoint without database access", async () => {
    const response = await app.request("http://localhost/healthz");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  test("protects the control panel when no session is present", async () => {
    const response = await app.request("http://localhost/control-panel");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login");
  });
});
