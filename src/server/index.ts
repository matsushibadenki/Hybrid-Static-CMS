import { serve } from "@hono/node-server";
import { config } from "../core/config";
import { ensureDefaultSettings } from "../core/settings";
import { renderPublishedArtifacts } from "../core/renderer";
import { runScheduledJobs } from "../core/scheduler";
import { loadPlugins } from "../core/hooks";
import { createApp } from "./app";
import { logInfo, logWarn } from "../core/logger";
import { reportOperationalEvent } from "../core/operatorAlerts";

if (import.meta.main) {
  await ensureDefaultSettings().catch((error) => {
    logWarn("startup.settings_unavailable", "Initial settings are not ready; complete /setup after database migration.", { error });
  });
  await loadPlugins();
  const app = createApp();
  await renderPublishedArtifacts().catch((error) => {
    return reportOperationalEvent({
      level: "error",
      action: "startup.render_failed",
      message: "Initial artifact rendering was skipped.",
      context: { error },
    });
  });

  let scheduledJobRunning = false;
  setInterval(async () => {
    if (scheduledJobRunning) return;
    scheduledJobRunning = true;
    try {
      await runScheduledJobs();
    } catch (error) {
      await reportOperationalEvent({
        level: "error",
        action: "scheduler.run_failed",
        message: "Scheduled maintenance was skipped.",
        context: { error },
      });
    } finally {
      scheduledJobRunning = false;
    }
  }, 60_000);

  serve({ fetch: app.fetch, port: config.port }, (info) => {
    logInfo("server.started", `${config.appName} is listening.`, { port: info.port });
  });
}
