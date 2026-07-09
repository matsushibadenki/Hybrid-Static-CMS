import { Hono } from "hono";
import { getDashboardStats } from "../../core/dashboard";
import { adminLayout } from "../../core/layout";
import { createPage, deletePage, getPageById, listPages, updatePage } from "../../core/pages";
import { createPost, deletePost, getPostById, listPosts, updatePost } from "../../core/posts";
import { renderPublishedArtifacts } from "../../core/renderer";
import { slugify, escapeHtml } from "../../core/content";
import { requireRole } from "../../core/auth";
import { config } from "../../core/config";

function splitCsv(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function postForm(action: string, values?: Record<string, string>) {
  return `
    <form method="post" action="${action}" class="form-grid">
      <label>Title <input name="title" value="${escapeHtml(values?.title ?? "")}" required /></label>
      <label>Slug <input name="slug" value="${escapeHtml(values?.slug ?? "")}" placeholder="auto-generated if empty" /></label>
      <label>Excerpt <textarea name="excerpt">${escapeHtml(values?.excerpt ?? "")}</textarea></label>
      <label>Body (Markdown-like) <textarea name="bodyMd">${escapeHtml(values?.bodyMd ?? "")}</textarea></label>
      <label>Body HTML override <textarea name="bodyHtml">${escapeHtml(values?.bodyHtml ?? "")}</textarea></label>
      <label>Status
        <select name="status">
          <option value="draft" ${values?.status === "draft" ? "selected" : ""}>Draft</option>
          <option value="published" ${values?.status === "published" ? "selected" : ""}>Published</option>
          <option value="scheduled" ${values?.status === "scheduled" ? "selected" : ""}>Scheduled</option>
        </select>
      </label>
      <label>Published at <input type="datetime-local" name="publishedAt" value="${escapeHtml(values?.publishedAt ?? "")}" /></label>
      <label>Categories (comma-separated slugs) <input name="categories" value="${escapeHtml(values?.categories ?? "")}" /></label>
      <label>Tags (comma-separated slugs) <input name="tags" value="${escapeHtml(values?.tags ?? "")}" /></label>
      <label>SEO title <input name="seoTitle" value="${escapeHtml(values?.seoTitle ?? "")}" /></label>
      <label>SEO description <textarea name="seoDescription">${escapeHtml(values?.seoDescription ?? "")}</textarea></label>
      <div class="row">
        <button class="button button-primary" type="submit">Save post</button>
      </div>
    </form>
  `;
}

function pageForm(action: string, values?: Record<string, string>) {
  return `
    <form method="post" action="${action}" class="form-grid">
      <label>Title <input name="title" value="${escapeHtml(values?.title ?? "")}" required /></label>
      <label>Slug <input name="slug" value="${escapeHtml(values?.slug ?? "")}" placeholder="auto-generated if empty" /></label>
      <label>Excerpt <textarea name="excerpt">${escapeHtml(values?.excerpt ?? "")}</textarea></label>
      <label>Body (Markdown-like) <textarea name="bodyMd">${escapeHtml(values?.bodyMd ?? "")}</textarea></label>
      <label>Body HTML override <textarea name="bodyHtml">${escapeHtml(values?.bodyHtml ?? "")}</textarea></label>
      <label>Status
        <select name="status">
          <option value="draft" ${values?.status === "draft" ? "selected" : ""}>Draft</option>
          <option value="published" ${values?.status === "published" ? "selected" : ""}>Published</option>
          <option value="scheduled" ${values?.status === "scheduled" ? "selected" : ""}>Scheduled</option>
        </select>
      </label>
      <label>Published at <input type="datetime-local" name="publishedAt" value="${escapeHtml(values?.publishedAt ?? "")}" /></label>
      <label>SEO title <input name="seoTitle" value="${escapeHtml(values?.seoTitle ?? "")}" /></label>
      <label>SEO description <textarea name="seoDescription">${escapeHtml(values?.seoDescription ?? "")}</textarea></label>
      <div class="row">
        <button class="button button-primary" type="submit">Save page</button>
      </div>
    </form>
  `;
}

export const adminRoutes = new Hono();

adminRoutes.use("/*", requireRole("owner", "admin", "editor", "author"));

adminRoutes.get("/", async (c) => {
  const user = c.get("sessionUser");
  const stats = await getDashboardStats();
  const recent = await listPosts({ page: 1, limit: 8, status: "any" });

  const body = `
    <section class="stats">
      <div class="stat"><p class="meta">Posts</p><h2>${stats.posts}</h2></div>
      <div class="stat"><p class="meta">Published</p><h2>${stats.published}</h2></div>
      <div class="stat"><p class="meta">Pages</p><h2>${stats.pages}</h2></div>
      <div class="stat"><p class="meta">Users</p><h2>${stats.users}</h2></div>
    </section>
    <div class="grid" style="margin-top:20px;">
      <article>
        <h2>Recent content</h2>
        <table>
          <thead><tr><th>Title</th><th>Status</th><th>Updated</th></tr></thead>
          <tbody>
            ${recent.items
              .map(
                (post) => `
                  <tr>
                    <td><a href="${config.controlPanelPath}/posts/${post.id}/edit">${escapeHtml(post.title)}</a></td>
                    <td>${escapeHtml(post.status)}</td>
                    <td>${new Date(post.updatedAt).toLocaleString("en-US")}</td>
                  </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </article>
      <aside>
        <h2>Publishing model</h2>
        <p>Published posts regenerate static fragments, RSS, sitemap, and the embeddable script output.</p>
        <div class="row">
          <a class="button" href="/cms/posts/latest.html">Latest fragment</a>
          <a class="button" href="/cms/posts/list.html">List page</a>
          <a class="button" href="/cms/pages/index.html">Pages output</a>
        </div>
      </aside>
    </div>
  `;

  return c.html(adminLayout("Dashboard", user, body));
});

adminRoutes.get("/posts", async (c) => {
  const user = c.get("sessionUser");
  const posts = await listPosts({ page: 1, limit: 50, status: "any" });
  const body = `
    <div class="row" style="margin-bottom:16px;">
      <a class="button button-primary" href="${config.controlPanelPath}/posts/new">New post</a>
      <form method="post" action="${config.controlPanelPath}/render">
        <button class="button" type="submit">Regenerate fragments</button>
      </form>
    </div>
    <table>
      <thead><tr><th>Title</th><th>Status</th><th>Categories</th><th>Updated</th><th>Actions</th></tr></thead>
      <tbody>
        ${posts.items
          .map(
            (post) => `
              <tr>
                <td><a href="${config.controlPanelPath}/posts/${post.id}/edit">${escapeHtml(post.title)}</a></td>
                <td>${escapeHtml(post.status)}</td>
                <td>${escapeHtml(post.categories.join(", "))}</td>
                <td>${new Date(post.updatedAt).toLocaleString("en-US")}</td>
                <td>
                  <div class="row">
                    <a class="button" href="${config.controlPanelPath}/posts/${post.id}/edit">Edit</a>
                    <form method="post" action="${config.controlPanelPath}/posts/${post.id}/delete">
                      <button class="button" type="submit">Delete</button>
                    </form>
                  </div>
                </td>
              </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;

  return c.html(adminLayout("Posts", user, body));
});

adminRoutes.get("/posts/new", (c) => {
  const user = c.get("sessionUser");
  return c.html(adminLayout("New Post", user, postForm(`${config.controlPanelPath}/posts`)));
});

adminRoutes.post("/posts", async (c) => {
  const user = c.get("sessionUser");
  if (!user) {
    return c.redirect("/login");
  }

  const form = await c.req.formData();
  const post = await createPost(
    {
      title: String(form.get("title") ?? ""),
      slug: String(form.get("slug") ?? "") || slugify(String(form.get("title") ?? "")),
      excerpt: String(form.get("excerpt") ?? ""),
      bodyMd: String(form.get("bodyMd") ?? ""),
      bodyHtml: String(form.get("bodyHtml") ?? ""),
      status: (String(form.get("status") ?? "draft") as "draft" | "published" | "scheduled"),
      publishedAt: String(form.get("publishedAt") ?? "") || null,
      categorySlugs: splitCsv(form.get("categories")),
      tagSlugs: splitCsv(form.get("tags")),
      seoTitle: String(form.get("seoTitle") ?? ""),
      seoDescription: String(form.get("seoDescription") ?? ""),
    },
    user.id,
  );

  await renderPublishedArtifacts();
  return c.redirect(`${config.controlPanelPath}/posts/${post?.id ?? ""}/edit`);
});

adminRoutes.get("/posts/:id/edit", async (c) => {
  const user = c.get("sessionUser");
  const post = await getPostById(Number(c.req.param("id")));
  if (!post) {
    return c.text("Not found", 404);
  }

  return c.html(
    adminLayout(
      "Edit Post",
      user,
      postForm(`${config.controlPanelPath}/posts/${post.id}`, {
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt ?? "",
        bodyMd: post.bodyMd ?? "",
        bodyHtml: post.bodyHtml ?? "",
        status: post.status,
        publishedAt: post.publishedAt ? new Date(post.publishedAt).toISOString().slice(0, 16) : "",
        categories: post.categories.join(", "),
        tags: post.tags.join(", "),
        seoTitle: post.seoTitle ?? "",
        seoDescription: post.seoDescription ?? "",
      }),
    ),
  );
});

adminRoutes.post("/posts/:id", async (c) => {
  const form = await c.req.formData();
  await updatePost(Number(c.req.param("id")), {
    title: String(form.get("title") ?? ""),
    slug: String(form.get("slug") ?? "") || slugify(String(form.get("title") ?? "")),
    excerpt: String(form.get("excerpt") ?? ""),
    bodyMd: String(form.get("bodyMd") ?? ""),
    bodyHtml: String(form.get("bodyHtml") ?? ""),
    status: (String(form.get("status") ?? "draft") as "draft" | "published" | "scheduled"),
    publishedAt: String(form.get("publishedAt") ?? "") || null,
    categorySlugs: splitCsv(form.get("categories")),
    tagSlugs: splitCsv(form.get("tags")),
    seoTitle: String(form.get("seoTitle") ?? ""),
    seoDescription: String(form.get("seoDescription") ?? ""),
  });

  await renderPublishedArtifacts();
  return c.redirect(`${config.controlPanelPath}/posts/${c.req.param("id")}/edit`);
});

adminRoutes.post("/posts/:id/delete", async (c) => {
  await deletePost(Number(c.req.param("id")));
  await renderPublishedArtifacts();
  return c.redirect(`${config.controlPanelPath}/posts`);
});

adminRoutes.post("/render", async (c) => {
  await renderPublishedArtifacts();
  return c.redirect(`${config.controlPanelPath}/posts`);
});

adminRoutes.get("/pages", async (c) => {
  const user = c.get("sessionUser");
  const pages = await listPages({ page: 1, limit: 50, status: "any" });
  const body = `
    <div class="row" style="margin-bottom:16px;">
      <a class="button button-primary" href="${config.controlPanelPath}/pages/new">New page</a>
    </div>
    <table>
      <thead><tr><th>Title</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead>
      <tbody>
        ${pages.items
          .map(
            (page) => `
              <tr>
                <td><a href="${config.controlPanelPath}/pages/${page.id}/edit">${escapeHtml(page.title)}</a></td>
                <td>${escapeHtml(page.status)}</td>
                <td>${new Date(page.updatedAt).toLocaleString("en-US")}</td>
                <td>
                  <div class="row">
                    <a class="button" href="${config.controlPanelPath}/pages/${page.id}/edit">Edit</a>
                    <a class="button" href="/cms/pages/${page.slug}.html">View output</a>
                    <form method="post" action="${config.controlPanelPath}/pages/${page.id}/delete">
                      <button class="button" type="submit">Delete</button>
                    </form>
                  </div>
                </td>
              </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;

  return c.html(adminLayout("Pages", user, body));
});

adminRoutes.get("/pages/new", (c) => {
  const user = c.get("sessionUser");
  return c.html(adminLayout("New Page", user, pageForm(`${config.controlPanelPath}/pages`)));
});

adminRoutes.post("/pages", async (c) => {
  const user = c.get("sessionUser");
  if (!user) {
    return c.redirect("/login");
  }

  const form = await c.req.formData();
  const page = await createPage(
    {
      title: String(form.get("title") ?? ""),
      slug: String(form.get("slug") ?? "") || slugify(String(form.get("title") ?? "")),
      excerpt: String(form.get("excerpt") ?? ""),
      bodyMd: String(form.get("bodyMd") ?? ""),
      bodyHtml: String(form.get("bodyHtml") ?? ""),
      status: String(form.get("status") ?? "draft") as "draft" | "published" | "scheduled",
      publishedAt: String(form.get("publishedAt") ?? "") || null,
      seoTitle: String(form.get("seoTitle") ?? ""),
      seoDescription: String(form.get("seoDescription") ?? ""),
    },
    user.id,
  );

  await renderPublishedArtifacts();
  return c.redirect(`${config.controlPanelPath}/pages/${page?.id ?? ""}/edit`);
});

adminRoutes.get("/pages/:id/edit", async (c) => {
  const user = c.get("sessionUser");
  const page = await getPageById(Number(c.req.param("id")));
  if (!page) {
    return c.text("Not found", 404);
  }

  return c.html(
    adminLayout(
      "Edit Page",
      user,
      pageForm(`${config.controlPanelPath}/pages/${page.id}`, {
        title: page.title,
        slug: page.slug,
        excerpt: page.excerpt ?? "",
        bodyMd: page.bodyMd ?? "",
        bodyHtml: page.bodyHtml ?? "",
        status: page.status,
        publishedAt: page.publishedAt ? new Date(page.publishedAt).toISOString().slice(0, 16) : "",
        seoTitle: page.seoTitle ?? "",
        seoDescription: page.seoDescription ?? "",
      }),
    ),
  );
});

adminRoutes.post("/pages/:id", async (c) => {
  const form = await c.req.formData();
  await updatePage(Number(c.req.param("id")), {
    title: String(form.get("title") ?? ""),
    slug: String(form.get("slug") ?? "") || slugify(String(form.get("title") ?? "")),
    excerpt: String(form.get("excerpt") ?? ""),
    bodyMd: String(form.get("bodyMd") ?? ""),
    bodyHtml: String(form.get("bodyHtml") ?? ""),
    status: String(form.get("status") ?? "draft") as "draft" | "published" | "scheduled",
    publishedAt: String(form.get("publishedAt") ?? "") || null,
    seoTitle: String(form.get("seoTitle") ?? ""),
    seoDescription: String(form.get("seoDescription") ?? ""),
  });

  await renderPublishedArtifacts();
  return c.redirect(`${config.controlPanelPath}/pages/${c.req.param("id")}/edit`);
});

adminRoutes.post("/pages/:id/delete", async (c) => {
  await deletePage(Number(c.req.param("id")));
  await renderPublishedArtifacts();
  return c.redirect(`${config.controlPanelPath}/pages`);
});
