import path from "node:path";
import { Context, Hono } from "hono";
import { config } from "../../core/config";
import { getPageBySlug } from "../../core/pages";
import { getPostBySlug } from "../../core/posts";
import { renderPage, renderPost } from "../../core/renderer";
import { verifyPreviewToken } from "../../core/previews";

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
  const extension = path.extname(normalized).toLowerCase();
  const contentTypes: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".xml": "application/xml; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".pdf": "application/pdf",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
  };
  return new Response(file, {
    headers: { "Content-Type": contentTypes[extension] ?? "application/octet-stream" },
  });
}

publicRoutes.get("/index.html", (c) => sendFile(c, "index.html"));
publicRoutes.get("/llms.txt", (c) => sendFile(c, "llms.txt"));
publicRoutes.get("/robots.txt", (c) => sendFile(c, "robots.txt"));
publicRoutes.get("/sitemap.xml", (c) => sendFile(c, "sitemap.xml"));
publicRoutes.get("/preview/:type/:slug", async (c) => {
  const type = c.req.param("type");
  const slug = c.req.param("slug");
  const token = c.req.query("token") ?? "";
  if (type !== "post" && type !== "page") return c.notFound();
  const previewType = type as "post" | "page";
  if (!(await verifyPreviewToken(token, previewType, slug))) return c.text("Preview link is invalid or expired.", 403);
  if (type === "post") {
    const post = await getPostBySlug(slug, "any");
    return post ? c.html(renderPost(post)) : c.notFound();
  }
  const page = await getPageBySlug(slug, "any");
  return page ? c.html(await renderPage(page)) : c.notFound();
});
publicRoutes.get("/cms/*", (c) => {
  const relative = c.req.path.replace(/^\//, "");
  return sendFile(c, relative);
});
publicRoutes.get("/assets/*", (c) => {
  const relative = c.req.path.replace(/^\//, "");
  return sendFile(c, relative);
});
