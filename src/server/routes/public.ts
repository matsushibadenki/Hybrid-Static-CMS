import path from "node:path";
import { realpath, stat } from "node:fs/promises";
import { Context, Hono } from "hono";
import { config } from "../../core/config";
import { getPageBySlug } from "../../core/pages";
import { getPostBySlug } from "../../core/posts";
import { renderPage, renderPost } from "../../core/renderer";
import { verifyPreviewToken } from "../../core/previews";
import { getPostSeriesNavigation } from "../../core/series";
import { getPostPermalinkPattern } from "../../core/settings";
import { listApprovedCommentsForPosts } from "../../core/comments";

export const publicRoutes = new Hono();

async function sendFile(c: Context, relativePath: string) {
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const segments = normalized.split(/[\\/]/).filter(Boolean);
  if (segments.some((segment) => segment.startsWith("."))) {
    return c.notFound();
  }
  const fullPath = path.join(config.publicHtmlDir, normalized);
  let publicRoot: string;
  let resolvedPath: string;
  try {
    [publicRoot, resolvedPath] = await Promise.all([realpath(config.publicHtmlDir), realpath(fullPath)]);
    if ((await stat(resolvedPath)).isDirectory()) {
      resolvedPath = await realpath(path.join(resolvedPath, "index.html"));
    }
  } catch {
    return c.notFound();
  }
  if (resolvedPath !== publicRoot && !resolvedPath.startsWith(`${publicRoot}${path.sep}`)) {
    return c.notFound();
  }
  if (!(await stat(resolvedPath)).isFile()) return c.notFound();
  const extension = path.extname(resolvedPath).toLowerCase();
  const contentTypes: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".htm": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".xml": "application/xml; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".pdf": "application/pdf",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".ico": "image/x-icon",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
    ".wasm": "application/wasm",
  };
  const contentType = contentTypes[extension];
  if (!contentType) return c.notFound();
  const file = Bun.file(resolvedPath);
  return new Response(file, {
    headers: { "Content-Type": contentType, "X-Content-Type-Options": "nosniff" },
  });
}

publicRoutes.get("/", (c) => c.redirect("/index.html"));
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
    if (!post) return c.notFound();
    const comments = await listApprovedCommentsForPosts([post.id]);
    return c.html(renderPost(post, await getPostSeriesNavigation(post.id), await getPostPermalinkPattern(), comments.get(post.id) ?? []));
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
publicRoutes.get("*", (c) => {
  const relative = c.req.path.replace(/^\//, "");
  return sendFile(c, relative);
});
