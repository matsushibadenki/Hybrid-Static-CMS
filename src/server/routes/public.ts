import path from "node:path";
import { Context, Hono } from "hono";
import { config } from "../../core/config";

export const publicRoutes = new Hono();

async function sendFile(c: Context, relativePath: string) {
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const segments = normalized.split(/[\\/]/).filter(Boolean);
  if (segments.some((segment) => segment.startsWith("."))) {
    return c.notFound();
  }
  const fullPath = path.join(config.publicHtmlDir, normalized);
  const file = Bun.file(fullPath);
  if (!(await file.exists())) {
    return c.notFound();
  }
  return new Response(file);
}

publicRoutes.get("/index.html", (c) => sendFile(c, "index.html"));
publicRoutes.get("/llms.txt", (c) => sendFile(c, "llms.txt"));
publicRoutes.get("/robots.txt", (c) => sendFile(c, "robots.txt"));
publicRoutes.get("/sitemap.xml", (c) => sendFile(c, "sitemap.xml"));
publicRoutes.get("/cms/*", (c) => {
  const relative = c.req.path.replace(/^\//, "");
  return sendFile(c, relative);
});
