import { Hono } from "hono";
import { config } from "../core/config";
import { sessionMiddleware } from "../core/auth";
import { apiKeyMiddleware } from "../core/apiKeys";
import { csrfMiddleware } from "../core/csrf";
import { authRoutes } from "./routes/auth";
import { apiRoutes } from "./routes/api";
import { adminRoutes } from "./routes/admin";
import { publicRoutes } from "./routes/public";
import { healthRoutes } from "./routes/health";
import { customApiRoutes } from "../core/extensions";
import { reportOperationalEvent } from "../core/operatorAlerts";
import { incrementOperationalMetric } from "../core/metrics";

function isPublicContentPath(path: string) {
  return !path.startsWith(config.cmsApiPrefix) && !path.startsWith(config.controlPanelPath) && !["/healthz", "/readyz", "/login", "/logout", "/setup"].includes(path);
}

export function createApp() {
  const app = new Hono();
  app.use("*", sessionMiddleware);
  app.use("*", apiKeyMiddleware);
  app.use("*", csrfMiddleware);
  app.use("*", async (c, next) => {
    await next();
    if (!isPublicContentPath(c.req.path)) return;
    void incrementOperationalMetric("http.public_request").catch(() => undefined);
    if (c.res.status >= 400 && c.res.status < 500) void incrementOperationalMetric("http.public_4xx").catch(() => undefined);
  });
  app.route("/", authRoutes);
  app.route("/", healthRoutes);
  app.route(config.cmsApiPrefix, apiRoutes);
  app.route(config.cmsApiPrefix, customApiRoutes);
  app.route(config.controlPanelPath, adminRoutes);
  app.route("/", publicRoutes);
  app.onError((error, c) => {
    if (isPublicContentPath(c.req.path)) void incrementOperationalMetric("http.public_5xx").catch(() => undefined);
    void reportOperationalEvent({
      level: "error",
      action: "http.unhandled_error",
      message: "An unhandled request error returned HTTP 500.",
      context: {
        error,
        method: c.req.method,
        path: new URL(c.req.url).pathname,
      },
    });
    return c.text("Internal Server Error", 500);
  });
  return app;
}
