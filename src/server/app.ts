import { Hono } from "hono";
import { config } from "../core/config";
import { sessionMiddleware } from "../core/auth";
import { csrfMiddleware } from "../core/csrf";
import { authRoutes } from "./routes/auth";
import { apiRoutes } from "./routes/api";
import { adminRoutes } from "./routes/admin";
import { publicRoutes } from "./routes/public";
import { healthRoutes } from "./routes/health";
import { customApiRoutes } from "../core/extensions";

export function createApp() {
  const app = new Hono();
  app.use("*", sessionMiddleware);
  app.use("*", csrfMiddleware);
  app.route("/", authRoutes);
  app.route("/", healthRoutes);
  app.route(config.cmsApiPrefix, apiRoutes);
  app.route(config.controlPanelPath, adminRoutes);
  app.route("/", publicRoutes);
  app.route(config.cmsApiPrefix, customApiRoutes);
  app.get("/", (c) => c.redirect("/index.html"));
  app.onError((error, c) => {
    console.error(error);
    return c.text("Internal Server Error", 500);
  });
  return app;
}
