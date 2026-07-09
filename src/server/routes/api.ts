import { Hono } from "hono";
import { slugify } from "../../core/content";
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

  await renderPublishedArtifacts();
  return c.json(post);
});

apiRoutes.delete("/posts/:id", async (c) => {
  const user = c.get("sessionUser");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await deletePost(Number(c.req.param("id")));
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

  await renderPublishedArtifacts();
  return c.json(page);
});

apiRoutes.delete("/pages/:id", async (c) => {
  const user = c.get("sessionUser");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await deletePage(Number(c.req.param("id")));
  await renderPublishedArtifacts();
  return c.json({ ok: true });
});
