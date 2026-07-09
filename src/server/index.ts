import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { config } from "../core/config";
import { ensureDefaultSettings } from "../core/settings";
import { renderPublishedArtifacts } from "../core/renderer";
import { sessionMiddleware } from "../core/auth";
import { authRoutes } from "./routes/auth";
import { apiRoutes } from "./routes/api";
import { adminRoutes } from "./routes/admin";
import { publicRoutes } from "./routes/public";

const app = new Hono();

app.use("*", sessionMiddleware);
app.route("/", authRoutes);
app.route(config.cmsApiPrefix, apiRoutes);
app.route(config.controlPanelPath, adminRoutes);
app.route("/", publicRoutes);

app.get("/", (c) => c.redirect("/index.html"));

app.onError((error, c) => {
  console.error(error);
  return c.text("Internal Server Error", 500);
});

await ensureDefaultSettings();
await renderPublishedArtifacts().catch((error) => {
  console.warn("Initial artifact rendering skipped:", error);
});

serve(
  {
    fetch: app.fetch,
    port: config.port,
  },
  (info) => {
    console.log(`${config.appName} listening on http://localhost:${info.port}`);
  },
);
