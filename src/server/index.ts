import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { config } from "../core/config";
import { ensureDefaultSettings } from "../core/settings";
import { renderPublishedArtifacts } from "../core/renderer";
import { sessionMiddleware } from "../core/auth";
import { csrfMiddleware } from "../core/csrf";
import { authRoutes } from "./routes/auth";
import { apiRoutes } from "./routes/api";
import { adminRoutes } from "./routes/admin";
import { publicRoutes } from "./routes/public";
import { runScheduledJobs } from "../core/scheduler";
import { loadPlugins } from "../core/hooks";
import { customApiRoutes } from "../core/extensions";
import { healthRoutes } from "./routes/health";

const app = new Hono();

app.use("*", sessionMiddleware);
app.use("*", csrfMiddleware);
app.route("/", authRoutes);
app.route("/", healthRoutes);
app.route(config.cmsApiPrefix, apiRoutes);
app.route(config.controlPanelPath, adminRoutes);
app.route("/", publicRoutes);

app.get("/", (c) => c.redirect("/index.html"));

app.onError((error, c) => {
  console.error(error);
  return c.text("Internal Server Error", 500);
});

await ensureDefaultSettings().catch((error) => {
  console.warn("Initial settings are not ready; complete /setup after database migration:", error);
});
await loadPlugins();
app.route(config.cmsApiPrefix, customApiRoutes);
await renderPublishedArtifacts().catch((error) => {
  console.warn("Initial artifact rendering skipped:", error);
});

let scheduledJobRunning = false;
setInterval(async () => {
  if (scheduledJobRunning) return;
  scheduledJobRunning = true;
  try {
    const result = await runScheduledJobs();
    if (result.publishedPosts || result.publishedPages) {
      await renderPublishedArtifacts();
    }
  } catch (error) {
    console.warn("Scheduled maintenance skipped:", error);
  } finally {
    scheduledJobRunning = false;
  }
}, 60_000);

serve(
  {
    fetch: app.fetch,
    port: config.port,
  },
  (info) => {
    console.log(`${config.appName} listening on http://localhost:${info.port}`);
  },
);
