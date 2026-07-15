import { serve } from "@hono/node-server";
import { config } from "../core/config";
import { ensureDefaultSettings } from "../core/settings";
import { renderPublishedArtifacts } from "../core/renderer";
import { runScheduledJobs } from "../core/scheduler";
import { loadPlugins } from "../core/hooks";
import { createApp } from "./app";

if (import.meta.main) {
  await ensureDefaultSettings().catch((error) => {
    console.warn("Initial settings are not ready; complete /setup after database migration:", error);
  });
  await loadPlugins();
  const app = createApp();
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

  serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`${config.appName} listening on http://localhost:${info.port}`);
  });
}
