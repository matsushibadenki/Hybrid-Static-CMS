import { access } from "node:fs/promises";
import { Hono } from "hono";
import { config } from "../../core/config";
import { sql } from "../../core/db";

export const healthRoutes = new Hono();

healthRoutes.get("/healthz", (c) => {
  return c.json({ status: "ok" });
});

healthRoutes.get("/readyz", async (c) => {
  const checks: Record<string, "ok" | "failed"> = {
    database: "failed",
    publicHtml: "failed",
    cmsOutput: "failed",
  };

  try {
    await sql`select 1`;
    checks.database = "ok";
  } catch {
    // Keep database errors out of the public readiness response.
  }

  try {
    await access(config.publicHtmlDir);
    checks.publicHtml = "ok";
  } catch {
    // The document root must be available before serving generated content.
  }

  try {
    await access(config.cmsOutputDir);
    checks.cmsOutput = "ok";
  } catch {
    // The renderer creates this directory during normal startup.
  }

  const ready = Object.values(checks).every((value) => value === "ok");
  return c.json({ status: ready ? "ready" : "not_ready", checks }, ready ? 200 : 503);
});
