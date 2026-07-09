import { Hono } from "hono";
import { requestIp, writeAuditLog } from "../../core/audit";
import { slugify } from "../../core/content";
import { deleteMedia, listMedia, uploadMedia } from "../../core/media";
import { createPage, deletePage, getPageBySlug, listPages, updatePage } from "../../core/pages";
import { createPost, deletePost, getPostBySlug, listPosts, updatePost } from "../../core/posts";
import { renderPublishedArtifacts } from "../../core/renderer";

export const apiRoutes = new Hono();

apiRoutes.get("/posts", async (c) => {
  const page = Number(c.req.query("page") ?? 1);
  const limit = Number(c.req.query("limit") ?? 10);
  const category = c.req.query("category");
  const status = c.req.query("status") ?? "published";
  const search = c.req.query("q");

  const data = await listPosts({ page, limit, category, status, search });
  return c.json(data);
});

apiRoutes.get("/posts/:slug", async (c) => {
  const post = await getPostBySlug(c.req.param("slug"));
  if (!post) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json(post);
});

apiRoutes.get("/pages", async (c) => {
  const page = Number(c.req.query("page") ?? 1);
  const limit = Number(c.req.query("limit") ?? 10);
  const status = c.req.query("status") ?? "published";
  const search = c.req.query("q");

  const data = await listPages({ page, limit, status, search });
  return c.json(data);
});

apiRoutes.get("/pages/:slug", async (c) => {
  const page = await getPageBySlug(c.req.param("slug"));
  if (!page) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json(page);
});

apiRoutes.get("/search", async (c) => {
  const q = c.req.query("q") ?? "";
  const data = await listPosts({ page: 1, limit: 20, status: "published", search: q });
  return c.json(data);
});

apiRoutes.get("/media", async (c) => {
  const items = await listMedia();
  return c.json({ items });
});

apiRoutes.post("/posts", async (c) => {
  const user = c.get("sessionUser");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const payload = await c.req.json();
  const post = await createPost(
    {
      title: payload.title,
      slug: payload.slug || slugify(payload.title),
      excerpt: payload.excerpt,
      bodyMd: payload.bodyMd,
      bodyHtml: payload.bodyHtml,
      status: payload.status ?? "draft",
      seoTitle: payload.seoTitle,
      seoDescription: payload.seoDescription,
      publishedAt: payload.publishedAt ?? null,
      categorySlugs: payload.categorySlugs ?? [],
      tagSlugs: payload.tagSlugs ?? [],
    },
    user.id,
  );

  await writeAuditLog({
    actorUserId: user.id,
    action: "post.create",
    targetType: "post",
    targetId: post?.id ?? null,
    summary: `Created post "${post?.title ?? payload.title}".`,
    ipAddress: requestIp(c),
  });
  await renderPublishedArtifacts();
  return c.json(post, 201);
});

apiRoutes.put("/posts/:id", async (c) => {
  const user = c.get("sessionUser");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const payload = await c.req.json();
  const post = await updatePost(Number(c.req.param("id")), {
    title: payload.title,
    slug: payload.slug || slugify(payload.title),
    excerpt: payload.excerpt,
    bodyMd: payload.bodyMd,
    bodyHtml: payload.bodyHtml,
    status: payload.status ?? "draft",
    seoTitle: payload.seoTitle,
    seoDescription: payload.seoDescription,
    publishedAt: payload.publishedAt ?? null,
    categorySlugs: payload.categorySlugs ?? [],
    tagSlugs: payload.tagSlugs ?? [],
  });

  await writeAuditLog({
    actorUserId: user.id,
    action: "post.update",
    targetType: "post",
    targetId: c.req.param("id"),
    summary: `Updated post "${post?.title ?? payload.title}".`,
    ipAddress: requestIp(c),
  });
  await renderPublishedArtifacts();
  return c.json(post);
});

apiRoutes.delete("/posts/:id", async (c) => {
  const user = c.get("sessionUser");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await deletePost(Number(c.req.param("id")));
  await writeAuditLog({
    actorUserId: user.id,
    action: "post.delete",
    targetType: "post",
    targetId: c.req.param("id"),
    summary: `Deleted post #${c.req.param("id")}.`,
    ipAddress: requestIp(c),
  });
  await renderPublishedArtifacts();
  return c.json({ ok: true });
});

apiRoutes.post("/pages", async (c) => {
  const user = c.get("sessionUser");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const payload = await c.req.json();
  const page = await createPage(
    {
      title: payload.title,
      slug: payload.slug || slugify(payload.title),
      excerpt: payload.excerpt,
      bodyMd: payload.bodyMd,
      bodyHtml: payload.bodyHtml,
      status: payload.status ?? "draft",
      seoTitle: payload.seoTitle,
      seoDescription: payload.seoDescription,
      publishedAt: payload.publishedAt ?? null,
    },
    user.id,
  );

  await writeAuditLog({
    actorUserId: user.id,
    action: "page.create",
    targetType: "page",
    targetId: page?.id ?? null,
    summary: `Created page "${page?.title ?? payload.title}".`,
    ipAddress: requestIp(c),
  });
  await renderPublishedArtifacts();
  return c.json(page, 201);
});

apiRoutes.put("/pages/:id", async (c) => {
  const user = c.get("sessionUser");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const payload = await c.req.json();
  const page = await updatePage(Number(c.req.param("id")), {
    title: payload.title,
    slug: payload.slug || slugify(payload.title),
    excerpt: payload.excerpt,
    bodyMd: payload.bodyMd,
    bodyHtml: payload.bodyHtml,
    status: payload.status ?? "draft",
    seoTitle: payload.seoTitle,
    seoDescription: payload.seoDescription,
    publishedAt: payload.publishedAt ?? null,
  });

  await writeAuditLog({
    actorUserId: user.id,
    action: "page.update",
    targetType: "page",
    targetId: c.req.param("id"),
    summary: `Updated page "${page?.title ?? payload.title}".`,
    ipAddress: requestIp(c),
  });
  await renderPublishedArtifacts();
  return c.json(page);
});

apiRoutes.delete("/pages/:id", async (c) => {
  const user = c.get("sessionUser");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await deletePage(Number(c.req.param("id")));
  await writeAuditLog({
    actorUserId: user.id,
    action: "page.delete",
    targetType: "page",
    targetId: c.req.param("id"),
    summary: `Deleted page #${c.req.param("id")}.`,
    ipAddress: requestIp(c),
  });
  await renderPublishedArtifacts();
  return c.json({ ok: true });
});

apiRoutes.post("/media", async (c) => {
  const user = c.get("sessionUser");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const form = await c.req.formData();
  const file = form.get("file");
  const altText = String(form.get("altText") ?? "");
  if (!(file instanceof File)) {
    return c.json({ error: "File is required" }, 400);
  }

  const media = await uploadMedia(file, altText, user.id);
  await writeAuditLog({
    actorUserId: user.id,
    action: "media.upload",
    targetType: "media",
    targetId: media?.id ?? null,
    summary: `Uploaded media "${media?.originalName ?? file.name}".`,
    ipAddress: requestIp(c),
  });
  return c.json(media, 201);
});

apiRoutes.delete("/media/:id", async (c) => {
  const user = c.get("sessionUser");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await deleteMedia(Number(c.req.param("id")));
  await writeAuditLog({
    actorUserId: user.id,
    action: "media.delete",
    targetType: "media",
    targetId: c.req.param("id"),
    summary: `Deleted media #${c.req.param("id")}.`,
    ipAddress: requestIp(c),
  });
  return c.json({ ok: true });
});
