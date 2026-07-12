import { Hono } from "hono";
import { listAuditLogs, requestIp, writeAuditLog } from "../../core/audit";
import { getDashboardStats } from "../../core/dashboard";
import {
  createFileSnapshot,
  getFileSnapshotDiff,
  listFileSnapshots,
  restoreFileSnapshot,
} from "../../core/fileSnapshots";
import {
  createForm,
  deleteForm,
  getFormById,
  listForms,
  listFormSubmissions,
  updateForm,
} from "../../core/forms";
import { adminLayout } from "../../core/layout";
import {
  deleteMedia,
  isAudioMedia,
  isImageMedia,
  isPdfMedia,
  isVideoMedia,
  listMedia,
  mediaEmbedSnippet,
  uploadMedia,
} from "../../core/media";
import { createPage, deletePage, getPageById, listPages, updatePage } from "../../core/pages";
import { createPost, deletePost, getPostById, listPosts, updatePost } from "../../core/posts";
import { renderPublishedArtifacts } from "../../core/renderer";
import { slugify, escapeHtml } from "../../core/content";
import { requireRole } from "../../core/auth";
import { config } from "../../core/config";
import { AppValidationError } from "../../core/validation";
import type { FormFieldRecord } from "../../core/types";

function splitCsv(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function noticeCard(message: string, tone: "success" | "error" = "success") {
  const background = tone === "success" ? "rgba(20, 99, 86, 0.12)" : "rgba(180, 73, 44, 0.12)";
  const border = tone === "success" ? "rgba(20, 99, 86, 0.28)" : "rgba(180, 73, 44, 0.28)";
  return `
    <div style="margin-bottom:16px; padding:14px 16px; border-radius:18px; background:${background}; border:1px solid ${border};">
      ${escapeHtml(message)}
    </div>
  `;
}

function queryNotice(c: { req: { query: (key: string) => string | undefined } }) {
  const success = c.req.query("success");
  const error = c.req.query("error");
  if (error) {
    return noticeCard(error, "error");
  }
  if (success) {
    return noticeCard(success, "success");
  }
  return "";
}

function postValuesFromForm(form: FormData) {
  return {
    title: String(form.get("title") ?? ""),
    slug: String(form.get("slug") ?? "") || slugify(String(form.get("title") ?? "")),
    excerpt: String(form.get("excerpt") ?? ""),
    bodyMd: String(form.get("bodyMd") ?? ""),
    bodyHtml: String(form.get("bodyHtml") ?? ""),
    status: String(form.get("status") ?? "draft"),
    publishedAt: String(form.get("publishedAt") ?? ""),
    categories: String(form.get("categories") ?? ""),
    tags: String(form.get("tags") ?? ""),
    seoTitle: String(form.get("seoTitle") ?? ""),
    seoDescription: String(form.get("seoDescription") ?? ""),
    seoNoindex: form.has("seoNoindex") ? "true" : "false",
    seoNofollow: form.has("seoNofollow") ? "true" : "false",
  };
}

function pageValuesFromForm(form: FormData) {
  return {
    title: String(form.get("title") ?? ""),
    slug: String(form.get("slug") ?? "") || slugify(String(form.get("title") ?? "")),
    excerpt: String(form.get("excerpt") ?? ""),
    bodyMd: String(form.get("bodyMd") ?? ""),
    bodyHtml: String(form.get("bodyHtml") ?? ""),
    status: String(form.get("status") ?? "draft"),
    publishedAt: String(form.get("publishedAt") ?? ""),
    seoTitle: String(form.get("seoTitle") ?? ""),
    seoDescription: String(form.get("seoDescription") ?? ""),
    seoNoindex: form.has("seoNoindex") ? "true" : "false",
    seoNofollow: form.has("seoNofollow") ? "true" : "false",
  };
}

function formValuesFromForm(form: FormData) {
  return {
    title: String(form.get("title") ?? ""),
    slug: String(form.get("slug") ?? "") || slugify(String(form.get("title") ?? "")),
    description: String(form.get("description") ?? ""),
    status: String(form.get("status") ?? "draft"),
    submitLabel: String(form.get("submitLabel") ?? "Send"),
    successMessage: String(form.get("successMessage") ?? "Thank you. Your submission has been received."),
    fieldsSpec: String(form.get("fieldsSpec") ?? ""),
  };
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
      <label><input type="checkbox" name="seoNoindex" value="true" ${values?.seoNoindex === "true" ? "checked" : ""} /> Prevent search indexing (noindex)</label>
      <label><input type="checkbox" name="seoNofollow" value="true" ${values?.seoNofollow === "true" ? "checked" : ""} /> Prevent link following (nofollow)</label>
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
      <label><input type="checkbox" name="seoNoindex" value="true" ${values?.seoNoindex === "true" ? "checked" : ""} /> Prevent search indexing (noindex)</label>
      <label><input type="checkbox" name="seoNofollow" value="true" ${values?.seoNofollow === "true" ? "checked" : ""} /> Prevent link following (nofollow)</label>
      <div class="row">
        <button class="button button-primary" type="submit">Save page</button>
      </div>
    </form>
  `;
}

function formBuilderForm(action: string, values?: Record<string, string>) {
  return `
    <form method="post" action="${action}" class="form-grid">
      <label>Title <input name="title" value="${escapeHtml(values?.title ?? "")}" required /></label>
      <label>Slug <input name="slug" value="${escapeHtml(values?.slug ?? "")}" placeholder="auto-generated if empty" /></label>
      <label>Description <textarea name="description">${escapeHtml(values?.description ?? "")}</textarea></label>
      <label>Status
        <select name="status">
          <option value="draft" ${values?.status === "draft" ? "selected" : ""}>Draft</option>
          <option value="published" ${values?.status === "published" ? "selected" : ""}>Published</option>
        </select>
      </label>
      <label>Submit button label <input name="submitLabel" value="${escapeHtml(values?.submitLabel ?? "Send")}" /></label>
      <label>Success message <textarea name="successMessage">${escapeHtml(values?.successMessage ?? "Thank you. Your submission has been received.")}</textarea></label>
      <label>Fields definition
        <textarea name="fieldsSpec">${escapeHtml(values?.fieldsSpec ?? "")}</textarea>
      </label>
      <p class="meta">One field per line: <code>name|Label|type|required|option1,option2</code>. Types: text, email, textarea, select, checkbox.</p>
      <div class="row">
        <button class="button button-primary" type="submit">Save form</button>
      </div>
    </form>
  `;
}

function snapshotHelperCard(returnTo: string, suggestions: string[]) {
  const suggestionButtons = suggestions
    .map(
      (item) => `
        <button
          class="button"
          type="button"
          onclick="this.closest('form').querySelector('[name=relativePath]').value='${escapeHtml(item)}'"
        >
          ${escapeHtml(item)}
        </button>
      `,
    )
    .join("");

  return `
    <div style="margin-top:20px; padding:18px; border-radius:22px; background:rgba(255,255,255,0.72); border:1px solid rgba(31,41,51,0.12);">
      <h2>Protect a public_html file</h2>
      <p class="meta">Create a quick snapshot before changing surrounding templates or hand-edited site files.</p>
      <form method="post" action="${config.controlPanelPath}/snapshots" class="form-grid">
        <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}" />
        <label>Relative path inside public_html
          <input name="relativePath" placeholder="index.html or assets/site.css" required />
        </label>
        <label>Reason
          <input name="reason" value="Before editing related site template" />
        </label>
        <div class="row">${suggestionButtons}</div>
        <div class="row">
          <button class="button" type="submit">Create snapshot</button>
          <a class="button" href="${config.controlPanelPath}/snapshots">Open snapshot history</a>
        </div>
      </form>
    </div>
  `;
}

function mediaHelperCard(items: Awaited<ReturnType<typeof listMedia>>) {
  const cards = items
    .slice(0, 8)
    .map((item) => {
      let preview = `<span class="meta">No preview</span>`;
      if (isImageMedia(item.mimeType)) {
        preview = `<img src="${item.publicUrl}" alt="${escapeHtml(item.altText ?? item.originalName)}" style="max-width:120px; max-height:88px; border-radius:12px; border:1px solid rgba(0,0,0,0.08);" />`;
      } else if (isVideoMedia(item.mimeType)) {
        preview = `<video src="${item.publicUrl}" style="max-width:120px; max-height:88px; border-radius:12px; border:1px solid rgba(0,0,0,0.08);" muted></video>`;
      } else if (isAudioMedia(item.mimeType)) {
        preview = `<span class="meta">Audio file</span>`;
      } else if (isPdfMedia(item.mimeType)) {
        preview = `<span class="meta">PDF file</span>`;
      }

      return `
        <article style="padding:16px; border-radius:18px; background:rgba(255,255,255,0.78); border:1px solid rgba(31,41,51,0.12);">
          <div style="margin-bottom:12px;">${preview}</div>
          <h3 style="font-size:1rem; margin-bottom:8px;">${escapeHtml(item.originalName)}</h3>
          <p class="meta" style="margin-bottom:10px;">${escapeHtml(item.mimeType)}</p>
          <label class="meta">Embed snippet
            <textarea readonly style="min-height:90px;">${escapeHtml(mediaEmbedSnippet(item))}</textarea>
          </label>
        </article>
      `;
    })
    .join("");

  return `
    <div style="margin-top:20px;">
      <div class="row" style="justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h2 style="margin-bottom:0;">Media for this content</h2>
        <a class="button" href="${config.controlPanelPath}/media">Open media library</a>
      </div>
      <p class="meta">Use images, videos, audio, and PDF assets by copying an embed snippet into the HTML body field.</p>
      <div class="grid" style="grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));">
        ${cards || "<p>No uploaded media yet.</p>"}
      </div>
    </div>
  `;
}

function parseFieldsSpec(spec: string) {
  return spec
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = "", label = "", type = "text", required = "false", options = ""] = line.split("|");
      return {
        name: name.trim(),
        label: label.trim(),
        type: type.trim() as "text" | "email" | "textarea" | "select" | "checkbox",
        required: required.trim().toLowerCase() === "true",
        options: options
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean),
      };
    });
}

function fieldsToSpec(fields: FormFieldRecord[]) {
  return fields
    .map((field) => {
      const options = field.options.join(",");
      return `${field.name}|${field.label}|${field.type}|${field.required ? "true" : "false"}|${options}`;
    })
    .join("\n");
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
      <div class="stat"><p class="meta">Forms</p><h2>${stats.forms}</h2></div>
      <div class="stat"><p class="meta">Media</p><h2>${stats.media}</h2></div>
      <div class="stat"><p class="meta">Logs</p><h2>${stats.logs}</h2></div>
      <div class="stat"><p class="meta">Snapshots</p><h2>${stats.snapshots}</h2></div>
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
          <a class="button" href="${config.controlPanelPath}/forms">Forms</a>
          <a class="button" href="${config.controlPanelPath}/media">Media library</a>
          <a class="button" href="${config.controlPanelPath}/snapshots">File snapshots</a>
        </div>
      </aside>
    </div>
  `;

  return c.html(adminLayout("Dashboard", user, body));
});

adminRoutes.get("/posts", async (c) => {
  const user = c.get("sessionUser");
  const q = c.req.query("q") ?? "";
  const status = c.req.query("status") ?? "any";
  const category = c.req.query("category") ?? "";
  const posts = await listPosts({ page: 1, limit: 50, status, category: category || undefined, search: q || undefined });
  const body = `
    ${queryNotice(c)}
    <div class="row" style="margin-bottom:16px;">
      <a class="button button-primary" href="${config.controlPanelPath}/posts/new">New post</a>
      <form method="post" action="${config.controlPanelPath}/render">
        <button class="button" type="submit">Regenerate fragments</button>
      </form>
    </div>
    <form method="get" action="${config.controlPanelPath}/posts" class="form-grid" style="margin-bottom:16px;">
      <div class="row">
        <input name="q" value="${escapeHtml(q)}" placeholder="Search title, excerpt, or body" />
        <select name="status">
          <option value="any" ${status === "any" ? "selected" : ""}>Any status</option>
          <option value="draft" ${status === "draft" ? "selected" : ""}>Draft</option>
          <option value="published" ${status === "published" ? "selected" : ""}>Published</option>
          <option value="scheduled" ${status === "scheduled" ? "selected" : ""}>Scheduled</option>
        </select>
        <input name="category" value="${escapeHtml(category)}" placeholder="Category slug" />
        <button class="button" type="submit">Filter</button>
      </div>
    </form>
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
  return c.html(adminLayout("New Post", user, queryNotice(c) + postForm(`${config.controlPanelPath}/posts`)));
});

adminRoutes.post("/posts", async (c) => {
  const user = c.get("sessionUser");
  if (!user) {
    return c.redirect("/login");
  }

  const form = await c.req.formData();
  const values = postValuesFromForm(form);
  let post;
  try {
    post = await createPost(
      {
        title: values.title,
        slug: values.slug,
        excerpt: values.excerpt,
        bodyMd: values.bodyMd,
        bodyHtml: values.bodyHtml,
        status: values.status as "draft" | "published" | "scheduled",
        publishedAt: values.publishedAt || null,
        categorySlugs: splitCsv(form.get("categories")),
        tagSlugs: splitCsv(form.get("tags")),
        seoTitle: values.seoTitle,
        seoDescription: values.seoDescription,
        seoNoindex: values.seoNoindex === "true",
        seoNofollow: values.seoNofollow === "true",
      },
      user.id,
    );
  } catch (error) {
    if (error instanceof AppValidationError) {
      return c.html(adminLayout("New Post", user, noticeCard(error.message, "error") + postForm(`${config.controlPanelPath}/posts`, values)), 400);
    }
    throw error;
  }

  await writeAuditLog({
    actorUserId: user.id,
    action: "post.create",
    targetType: "post",
    targetId: post?.id ?? null,
    summary: `Created post "${post?.title ?? form.get("title") ?? ""}".`,
    ipAddress: requestIp(c),
  });
  await renderPublishedArtifacts();
  return c.redirect(`${config.controlPanelPath}/posts/${post?.id ?? ""}/edit?success=${encodeURIComponent("Post saved.")}`);
});

adminRoutes.get("/posts/:id/edit", async (c) => {
  const user = c.get("sessionUser");
  const post = await getPostById(Number(c.req.param("id")));
  const mediaItems = await listMedia();
  if (!post) {
    return c.text("Not found", 404);
  }

  return c.html(
    adminLayout(
      "Edit Post",
      user,
      queryNotice(c) + postForm(`${config.controlPanelPath}/posts/${post.id}`, {
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
        seoNoindex: post.seoNoindex ? "true" : "false",
        seoNofollow: post.seoNofollow ? "true" : "false",
      }) +
        snapshotHelperCard(`${config.controlPanelPath}/posts/${post.id}/edit`, [
          "index.html",
          "assets/site.css",
          "cms/posts/latest.html",
        ]) +
        mediaHelperCard(mediaItems),
    ),
  );
});

adminRoutes.post("/posts/:id", async (c) => {
  const form = await c.req.formData();
  const user = c.get("sessionUser");
  const mediaItems = await listMedia();
  const values = postValuesFromForm(form);
  try {
    await updatePost(Number(c.req.param("id")), {
      title: values.title,
      slug: values.slug,
      excerpt: values.excerpt,
      bodyMd: values.bodyMd,
      bodyHtml: values.bodyHtml,
      status: values.status as "draft" | "published" | "scheduled",
      publishedAt: values.publishedAt || null,
      categorySlugs: splitCsv(form.get("categories")),
      tagSlugs: splitCsv(form.get("tags")),
      seoTitle: values.seoTitle,
      seoDescription: values.seoDescription,
      seoNoindex: values.seoNoindex === "true",
      seoNofollow: values.seoNofollow === "true",
    });
  } catch (error) {
    if (error instanceof AppValidationError) {
      return c.html(
        adminLayout(
          "Edit Post",
          user,
          noticeCard(error.message, "error") +
            postForm(`${config.controlPanelPath}/posts/${c.req.param("id")}`, values) +
            snapshotHelperCard(`${config.controlPanelPath}/posts/${c.req.param("id")}/edit`, [
              "index.html",
              "assets/site.css",
              "cms/posts/latest.html",
            ]) +
            mediaHelperCard(mediaItems),
        ),
        400,
      );
    }
    throw error;
  }

  await writeAuditLog({
    actorUserId: c.get("sessionUser")?.id ?? null,
    action: "post.update",
    targetType: "post",
    targetId: c.req.param("id"),
    summary: `Updated post #${c.req.param("id")}.`,
    ipAddress: requestIp(c),
  });
  await renderPublishedArtifacts();
  return c.redirect(`${config.controlPanelPath}/posts/${c.req.param("id")}/edit?success=${encodeURIComponent("Post updated.")}`);
});

adminRoutes.post("/posts/:id/delete", async (c) => {
  await deletePost(Number(c.req.param("id")));
  await writeAuditLog({
    actorUserId: c.get("sessionUser")?.id ?? null,
    action: "post.delete",
    targetType: "post",
    targetId: c.req.param("id"),
    summary: `Deleted post #${c.req.param("id")}.`,
    ipAddress: requestIp(c),
  });
  await renderPublishedArtifacts();
  return c.redirect(`${config.controlPanelPath}/posts`);
});

adminRoutes.post("/render", async (c) => {
  await renderPublishedArtifacts();
  await writeAuditLog({
    actorUserId: c.get("sessionUser")?.id ?? null,
    action: "renderer.regenerate",
    targetType: "system",
    targetId: "cms",
    summary: "Regenerated published CMS artifacts.",
    ipAddress: requestIp(c),
  });
  return c.redirect(`${config.controlPanelPath}/posts`);
});

adminRoutes.get("/pages", async (c) => {
  const user = c.get("sessionUser");
  const q = c.req.query("q") ?? "";
  const status = c.req.query("status") ?? "any";
  const pages = await listPages({ page: 1, limit: 50, status, search: q || undefined });
  const body = `
    ${queryNotice(c)}
    <div class="row" style="margin-bottom:16px;">
      <a class="button button-primary" href="${config.controlPanelPath}/pages/new">New page</a>
    </div>
    <form method="get" action="${config.controlPanelPath}/pages" class="form-grid" style="margin-bottom:16px;">
      <div class="row">
        <input name="q" value="${escapeHtml(q)}" placeholder="Search title, excerpt, or body" />
        <select name="status">
          <option value="any" ${status === "any" ? "selected" : ""}>Any status</option>
          <option value="draft" ${status === "draft" ? "selected" : ""}>Draft</option>
          <option value="published" ${status === "published" ? "selected" : ""}>Published</option>
          <option value="scheduled" ${status === "scheduled" ? "selected" : ""}>Scheduled</option>
        </select>
        <button class="button" type="submit">Filter</button>
      </div>
    </form>
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
  return c.html(adminLayout("New Page", user, queryNotice(c) + pageForm(`${config.controlPanelPath}/pages`)));
});

adminRoutes.get("/forms", async (c) => {
  const user = c.get("sessionUser");
  const q = c.req.query("q") ?? "";
  const status = (c.req.query("status") ?? "any") as "draft" | "published" | "any";
  const forms = await listForms(status, q || undefined);
  const recaptchaEnabled = Boolean(config.recaptchaSiteKey && config.recaptchaSecretKey);
  const body = `
    ${queryNotice(c)}
    <div class="row" style="margin-bottom:16px;">
      <a class="button button-primary" href="${config.controlPanelPath}/forms/new">New form</a>
    </div>
    <p class="meta" style="margin-bottom:16px;">
      reCAPTCHA v3: ${recaptchaEnabled ? "enabled" : "disabled"}.
      ${recaptchaEnabled ? "Published forms will request and verify tokens on submission." : "Set RECAPTCHA_SITE_KEY and RECAPTCHA_SECRET_KEY in .env to enable spam protection."}
    </p>
    <form method="get" action="${config.controlPanelPath}/forms" class="form-grid" style="margin-bottom:16px;">
      <div class="row">
        <input name="q" value="${escapeHtml(q)}" placeholder="Search title or slug" />
        <select name="status">
          <option value="any" ${status === "any" ? "selected" : ""}>Any status</option>
          <option value="draft" ${status === "draft" ? "selected" : ""}>Draft</option>
          <option value="published" ${status === "published" ? "selected" : ""}>Published</option>
        </select>
        <button class="button" type="submit">Filter</button>
      </div>
    </form>
    <table>
      <thead><tr><th>Title</th><th>Status</th><th>Fields</th><th>Actions</th></tr></thead>
      <tbody>
        ${forms
          .map(
            (form) => `
              <tr>
                <td><a href="${config.controlPanelPath}/forms/${form.id}/edit">${escapeHtml(form.title)}</a></td>
                <td>${escapeHtml(form.status)}</td>
                <td>${form.fields.length}</td>
                <td>
                  <div class="row">
                    <a class="button" href="${config.controlPanelPath}/forms/${form.id}/edit">Edit</a>
                    <a class="button" href="/cms/forms/${form.slug}.html">View HTML</a>
                    <form method="post" action="${config.controlPanelPath}/forms/${form.id}/delete">
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
  return c.html(adminLayout("Forms", user, body));
});

adminRoutes.get("/forms/new", (c) => {
  const user = c.get("sessionUser");
  return c.html(adminLayout("New Form", user, queryNotice(c) + formBuilderForm(`${config.controlPanelPath}/forms`)));
});

adminRoutes.post("/forms", async (c) => {
  const user = c.get("sessionUser");
  if (!user) {
    return c.redirect("/login");
  }
  const form = await c.req.formData();
  const values = formValuesFromForm(form);
  let created;
  try {
    created = await createForm(
      {
        title: values.title,
        slug: values.slug,
        description: values.description,
        status: values.status as "draft" | "published",
        submitLabel: values.submitLabel,
        successMessage: values.successMessage,
        fields: parseFieldsSpec(values.fieldsSpec),
      },
      user.id,
    );
  } catch (error) {
    if (error instanceof AppValidationError) {
      return c.html(adminLayout("New Form", user, noticeCard(error.message, "error") + formBuilderForm(`${config.controlPanelPath}/forms`, values)), 400);
    }
    throw error;
  }
  await writeAuditLog({
    actorUserId: user.id,
    action: "form.create",
    targetType: "form",
    targetId: created?.id ?? null,
    summary: `Created form "${created?.title ?? form.get("title") ?? ""}".`,
    ipAddress: requestIp(c),
  });
  await renderPublishedArtifacts();
  return c.redirect(`${config.controlPanelPath}/forms/${created?.id ?? ""}/edit?success=${encodeURIComponent("Form saved.")}`);
});

adminRoutes.get("/forms/:id/edit", async (c) => {
  const user = c.get("sessionUser");
  const form = await getFormById(Number(c.req.param("id")));
  if (!form) {
    return c.text("Not found", 404);
  }
  const recaptchaEnabled = Boolean(config.recaptchaSiteKey && config.recaptchaSecretKey);
  const submissions = await listFormSubmissions(form.id);
  const body =
    queryNotice(c) + formBuilderForm(`${config.controlPanelPath}/forms/${form.id}`, {
      title: form.title,
      slug: form.slug,
      description: form.description ?? "",
      status: form.status,
      submitLabel: form.submitLabel,
      successMessage: form.successMessage,
      fieldsSpec: fieldsToSpec(form.fields),
    }) +
    `
      <div style="margin-top:20px;">
        <p class="meta">reCAPTCHA v3 is currently ${recaptchaEnabled ? "enabled" : "disabled"} for published forms.</p>
        <div class="row" style="justify-content:space-between; align-items:center;">
          <h2 style="margin-bottom:0;">Submissions</h2>
          <a class="button" href="/cms/forms/${form.slug}.html">Open published form</a>
        </div>
        <table>
          <thead><tr><th>When</th><th>Payload</th></tr></thead>
          <tbody>
            ${submissions
              .map(
                (submission) => `
                  <tr>
                    <td>${new Date(submission.createdAt).toLocaleString("en-US")}</td>
                    <td><code>${escapeHtml(JSON.stringify(submission.payload))}</code></td>
                  </tr>`,
              )
              .join("") || "<tr><td colspan='2'>No submissions yet.</td></tr>"}
          </tbody>
        </table>
      </div>
    `;
  return c.html(adminLayout("Edit Form", user, body));
});

adminRoutes.post("/forms/:id", async (c) => {
  const form = await c.req.formData();
  const user = c.get("sessionUser");
  const existing = await getFormById(Number(c.req.param("id")));
  const submissions = existing ? await listFormSubmissions(existing.id) : [];
  const values = formValuesFromForm(form);
  try {
    await updateForm(Number(c.req.param("id")), {
      title: values.title,
      slug: values.slug,
      description: values.description,
      status: values.status as "draft" | "published",
      submitLabel: values.submitLabel,
      successMessage: values.successMessage,
      fields: parseFieldsSpec(values.fieldsSpec),
    });
  } catch (error) {
    if (error instanceof AppValidationError) {
      const submissionsTable = `
        <div style="margin-top:20px;">
          <p class="meta">reCAPTCHA v3 is currently ${Boolean(config.recaptchaSiteKey && config.recaptchaSecretKey) ? "enabled" : "disabled"} for published forms.</p>
          <div class="row" style="justify-content:space-between; align-items:center;">
            <h2 style="margin-bottom:0;">Submissions</h2>
            <a class="button" href="/cms/forms/${values.slug}.html">Open published form</a>
          </div>
          <table>
            <thead><tr><th>When</th><th>Payload</th></tr></thead>
            <tbody>
              ${submissions
                .map(
                  (submission) => `
                    <tr>
                      <td>${new Date(submission.createdAt).toLocaleString("en-US")}</td>
                      <td><code>${escapeHtml(JSON.stringify(submission.payload))}</code></td>
                    </tr>`,
                )
                .join("") || "<tr><td colspan='2'>No submissions yet.</td></tr>"}
            </tbody>
          </table>
        </div>
      `;
      return c.html(adminLayout("Edit Form", user, noticeCard(error.message, "error") + formBuilderForm(`${config.controlPanelPath}/forms/${c.req.param("id")}`, values) + submissionsTable), 400);
    }
    throw error;
  }
  await writeAuditLog({
    actorUserId: c.get("sessionUser")?.id ?? null,
    action: "form.update",
    targetType: "form",
    targetId: c.req.param("id"),
    summary: `Updated form #${c.req.param("id")}.`,
    ipAddress: requestIp(c),
  });
  await renderPublishedArtifacts();
  return c.redirect(`${config.controlPanelPath}/forms/${c.req.param("id")}/edit?success=${encodeURIComponent("Form updated.")}`);
});

adminRoutes.post("/forms/:id/delete", async (c) => {
  await deleteForm(Number(c.req.param("id")));
  await writeAuditLog({
    actorUserId: c.get("sessionUser")?.id ?? null,
    action: "form.delete",
    targetType: "form",
    targetId: c.req.param("id"),
    summary: `Deleted form #${c.req.param("id")}.`,
    ipAddress: requestIp(c),
  });
  await renderPublishedArtifacts();
  return c.redirect(`${config.controlPanelPath}/forms`);
});

adminRoutes.post("/pages", async (c) => {
  const user = c.get("sessionUser");
  if (!user) {
    return c.redirect("/login");
  }

  const form = await c.req.formData();
  const values = pageValuesFromForm(form);
  let page;
  try {
    page = await createPage(
      {
        title: values.title,
        slug: values.slug,
        excerpt: values.excerpt,
        bodyMd: values.bodyMd,
        bodyHtml: values.bodyHtml,
        status: values.status as "draft" | "published" | "scheduled",
        publishedAt: values.publishedAt || null,
        seoTitle: values.seoTitle,
        seoDescription: values.seoDescription,
        seoNoindex: values.seoNoindex === "true",
        seoNofollow: values.seoNofollow === "true",
      },
      user.id,
    );
  } catch (error) {
    if (error instanceof AppValidationError) {
      return c.html(adminLayout("New Page", user, noticeCard(error.message, "error") + pageForm(`${config.controlPanelPath}/pages`, values)), 400);
    }
    throw error;
  }

  await writeAuditLog({
    actorUserId: user.id,
    action: "page.create",
    targetType: "page",
    targetId: page?.id ?? null,
    summary: `Created page "${page?.title ?? form.get("title") ?? ""}".`,
    ipAddress: requestIp(c),
  });
  await renderPublishedArtifacts();
  return c.redirect(`${config.controlPanelPath}/pages/${page?.id ?? ""}/edit?success=${encodeURIComponent("Page saved.")}`);
});

adminRoutes.get("/pages/:id/edit", async (c) => {
  const user = c.get("sessionUser");
  const page = await getPageById(Number(c.req.param("id")));
  const mediaItems = await listMedia();
  if (!page) {
    return c.text("Not found", 404);
  }

  return c.html(
    adminLayout(
      "Edit Page",
      user,
      queryNotice(c) + pageForm(`${config.controlPanelPath}/pages/${page.id}`, {
        title: page.title,
        slug: page.slug,
        excerpt: page.excerpt ?? "",
        bodyMd: page.bodyMd ?? "",
        bodyHtml: page.bodyHtml ?? "",
        status: page.status,
        publishedAt: page.publishedAt ? new Date(page.publishedAt).toISOString().slice(0, 16) : "",
        seoTitle: page.seoTitle ?? "",
        seoDescription: page.seoDescription ?? "",
        seoNoindex: page.seoNoindex ? "true" : "false",
        seoNofollow: page.seoNofollow ? "true" : "false",
      }) +
        snapshotHelperCard(`${config.controlPanelPath}/pages/${page.id}/edit`, [
          "index.html",
          "about.php",
          `cms/pages/${page.slug}.html`,
        ]) +
        mediaHelperCard(mediaItems),
    ),
  );
});

adminRoutes.post("/pages/:id", async (c) => {
  const form = await c.req.formData();
  const user = c.get("sessionUser");
  const mediaItems = await listMedia();
  const values = pageValuesFromForm(form);
  try {
    await updatePage(Number(c.req.param("id")), {
      title: values.title,
      slug: values.slug,
      excerpt: values.excerpt,
      bodyMd: values.bodyMd,
      bodyHtml: values.bodyHtml,
      status: values.status as "draft" | "published" | "scheduled",
      publishedAt: values.publishedAt || null,
      seoTitle: values.seoTitle,
      seoDescription: values.seoDescription,
      seoNoindex: values.seoNoindex === "true",
      seoNofollow: values.seoNofollow === "true",
    });
  } catch (error) {
    if (error instanceof AppValidationError) {
      return c.html(
        adminLayout(
          "Edit Page",
          user,
          noticeCard(error.message, "error") +
            pageForm(`${config.controlPanelPath}/pages/${c.req.param("id")}`, values) +
            snapshotHelperCard(`${config.controlPanelPath}/pages/${c.req.param("id")}/edit`, [
              "index.html",
              "about.php",
              `cms/pages/${values.slug || "page"}.html`,
            ]) +
            mediaHelperCard(mediaItems),
        ),
        400,
      );
    }
    throw error;
  }

  await writeAuditLog({
    actorUserId: c.get("sessionUser")?.id ?? null,
    action: "page.update",
    targetType: "page",
    targetId: c.req.param("id"),
    summary: `Updated page #${c.req.param("id")}.`,
    ipAddress: requestIp(c),
  });
  await renderPublishedArtifacts();
  return c.redirect(`${config.controlPanelPath}/pages/${c.req.param("id")}/edit?success=${encodeURIComponent("Page updated.")}`);
});

adminRoutes.post("/pages/:id/delete", async (c) => {
  await deletePage(Number(c.req.param("id")));
  await writeAuditLog({
    actorUserId: c.get("sessionUser")?.id ?? null,
    action: "page.delete",
    targetType: "page",
    targetId: c.req.param("id"),
    summary: `Deleted page #${c.req.param("id")}.`,
    ipAddress: requestIp(c),
  });
  await renderPublishedArtifacts();
  return c.redirect(`${config.controlPanelPath}/pages`);
});

adminRoutes.get("/media", async (c) => {
  const user = c.get("sessionUser");
  const items = await listMedia();
  const body = `
    <div class="grid">
      <article>
        <h2>Upload media</h2>
        <form method="post" action="${config.controlPanelPath}/media" enctype="multipart/form-data" class="form-grid">
          <label>File <input type="file" name="file" required /></label>
          <label>Alt text <input name="altText" placeholder="Helpful for images and embeds" /></label>
          <div class="row">
            <button class="button button-primary" type="submit">Upload file</button>
          </div>
          <p class="meta">Allowed types: JPG, PNG, WebP, GIF, SVG, MP4, WebM, OGG video, MP3, M4A, OGG audio, WAV, PDF, TXT.</p>
        </form>
      </article>
      <aside>
        <h2>Usage</h2>
        <p>Uploaded files are published under the <code>/cms/uploads/</code> path so existing HTML and PHP pages can reference them directly. Posts and pages can now use image, video, audio, and PDF embed snippets from their edit screens.</p>
      </aside>
    </div>
    <div style="margin-top:20px;">
      <h2>Media library</h2>
      <table>
        <thead><tr><th>Preview</th><th>Name</th><th>Type</th><th>URL</th><th>Actions</th></tr></thead>
        <tbody>
          ${items
            .map((item) => {
              const preview = item.mimeType.startsWith("image/")
                ? `<img src="${item.publicUrl}" alt="${escapeHtml(item.altText ?? item.originalName)}" style="max-width:96px; max-height:72px; border-radius:12px; border:1px solid rgba(0,0,0,0.08);" />`
                : `<span class="meta">No preview</span>`;
              return `
                <tr>
                  <td>${preview}</td>
                  <td>
                    <strong>${escapeHtml(item.originalName)}</strong>
                    <div class="meta">${item.sizeBytes} bytes</div>
                  </td>
                  <td>${escapeHtml(item.mimeType)}</td>
                  <td><a href="${item.publicUrl}">${escapeHtml(item.publicUrl)}</a></td>
                  <td>
                    <div class="row">
                      <a class="button" href="${item.publicUrl}">Open</a>
                      <form method="post" action="${config.controlPanelPath}/media/${item.id}/delete">
                        <button class="button" type="submit">Delete</button>
                      </form>
                    </div>
                  </td>
                </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  return c.html(adminLayout("Media", user, body));
});

adminRoutes.post("/media", async (c) => {
  const user = c.get("sessionUser");
  if (!user) {
    return c.redirect("/login");
  }

  const form = await c.req.formData();
  const file = form.get("file");
  const altText = String(form.get("altText") ?? "");
  if (!(file instanceof File)) {
    return c.text("File is required", 400);
  }

  await uploadMedia(file, altText, user.id);
  await writeAuditLog({
    actorUserId: user.id,
    action: "media.upload",
    targetType: "media",
    targetId: file.name,
    summary: `Uploaded media "${file.name}".`,
    ipAddress: requestIp(c),
  });
  return c.redirect(`${config.controlPanelPath}/media`);
});

adminRoutes.post("/media/:id/delete", async (c) => {
  await deleteMedia(Number(c.req.param("id")));
  await writeAuditLog({
    actorUserId: c.get("sessionUser")?.id ?? null,
    action: "media.delete",
    targetType: "media",
    targetId: c.req.param("id"),
    summary: `Deleted media #${c.req.param("id")}.`,
    ipAddress: requestIp(c),
  });
  return c.redirect(`${config.controlPanelPath}/media`);
});

adminRoutes.get("/logs", async (c) => {
  const user = c.get("sessionUser");
  const items = await listAuditLogs(150);
  const body = `
    <h2>Audit logs</h2>
    <p class="meta">Recent authentication, publishing, media, and regeneration events.</p>
    <table>
      <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Summary</th><th>IP</th></tr></thead>
      <tbody>
        ${items
          .map(
            (item) => `
              <tr>
                <td>${new Date(item.createdAt).toLocaleString("en-US")}</td>
                <td>${escapeHtml(item.actorDisplayName ?? "System")}</td>
                <td>${escapeHtml(item.action)}</td>
                <td>${escapeHtml(item.targetType)}${item.targetId ? `:${escapeHtml(item.targetId)}` : ""}</td>
                <td>${escapeHtml(item.summary)}</td>
                <td>${escapeHtml(item.ipAddress ?? "-")}</td>
              </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;

  return c.html(adminLayout("Audit Logs", user, body));
});

adminRoutes.get("/snapshots", async (c) => {
  const user = c.get("sessionUser");
  const items = await listFileSnapshots(150);
  const body = `
    ${queryNotice(c)}
    <div class="grid">
      <article>
        <h2>Create snapshot</h2>
        <form method="post" action="${config.controlPanelPath}/snapshots" class="form-grid">
          <label>Relative path inside public_html
            <input name="relativePath" placeholder="index.html or assets/site.css" required />
          </label>
          <label>Reason
            <input name="reason" placeholder="Before manual homepage update" />
          </label>
          <div class="row">
            <button class="button button-primary" type="submit">Create snapshot</button>
          </div>
          <p class="meta">Allowed file types: .html, .css, .js, .php, .txt, .xml, .md</p>
        </form>
      </article>
      <aside>
        <h2>How it works</h2>
        <p>Snapshots store the current contents of safe text-based files from <code>public_html</code>. Restoring a snapshot writes that saved content back to the same path.</p>
      </aside>
    </div>
    <div style="margin-top:20px;">
      <h2>Snapshot history</h2>
      <table>
        <thead><tr><th>When</th><th>Path</th><th>Reason</th><th>Preview</th><th>Actions</th></tr></thead>
        <tbody>
          ${items
            .map(
              (item) => `
                <tr>
                  <td>${new Date(item.createdAt).toLocaleString("en-US")}</td>
                  <td><code>${escapeHtml(item.relativePath)}</code></td>
                  <td>${escapeHtml(item.reason ?? "-")}</td>
                  <td><code>${escapeHtml(item.contentPreview)}</code></td>
                  <td>
                    <div class="row">
                      <a class="button" href="${config.controlPanelPath}/snapshots/${item.id}/preview">Preview diff</a>
                      <a class="button" href="${config.controlPanelPath}/snapshots/${item.id}/confirm-restore">Restore</a>
                    </div>
                  </td>
                </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  return c.html(adminLayout("File Snapshots", user, body));
});

adminRoutes.post("/snapshots", async (c) => {
  const user = c.get("sessionUser");
  if (!user) {
    return c.redirect("/login");
  }

  const form = await c.req.formData();
  const relativePath = String(form.get("relativePath") ?? "");
  const reason = String(form.get("reason") ?? "");
  const returnTo = String(form.get("returnTo") ?? "");
  let snapshot;
  try {
    snapshot = await createFileSnapshot(relativePath, user.id, reason);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create snapshot.";
    return c.redirect(`${config.controlPanelPath}/snapshots?error=${encodeURIComponent(message)}`);
  }

  await writeAuditLog({
    actorUserId: user.id,
    action: "snapshot.create",
    targetType: "file_snapshot",
    targetId: snapshot?.id ?? null,
    summary: `Created file snapshot for "${relativePath}".`,
    ipAddress: requestIp(c),
  });

  const target = returnTo || `${config.controlPanelPath}/snapshots`;
  const separator = target.includes("?") ? "&" : "?";
  return c.redirect(`${target}${separator}success=${encodeURIComponent("Snapshot created.")}`);
});

adminRoutes.get("/snapshots/:id/preview", async (c) => {
  const user = c.get("sessionUser");
  const diff = await getFileSnapshotDiff(Number(c.req.param("id")));
  const body = `
    <div class="row" style="margin-bottom:16px;">
      <a class="button" href="${config.controlPanelPath}/snapshots">Back to snapshots</a>
      <a class="button button-primary" href="${config.controlPanelPath}/snapshots/${c.req.param("id")}/confirm-restore">Continue to restore</a>
    </div>
    <h2>Diff preview</h2>
    <p class="meta">Path: <code>${escapeHtml(diff.relativePath)}</code></p>
    <p class="meta">Reason: ${escapeHtml(diff.reason ?? "-")}</p>
    <p class="meta">Current file exists: ${diff.currentExists ? "yes" : "no"}</p>
    <table>
      <thead><tr><th>Line</th><th>Status</th><th>Snapshot</th><th>Current file</th></tr></thead>
      <tbody>
        ${diff.lines
          .map((line) => {
            const background =
              line.status === "same"
                ? "transparent"
                : line.status === "changed"
                  ? "rgba(180, 73, 44, 0.12)"
                  : line.status === "added"
                    ? "rgba(20, 99, 86, 0.12)"
                    : "rgba(176, 92, 0, 0.12)";
            return `
              <tr style="background:${background};">
                <td>${line.lineNumber}</td>
                <td>${escapeHtml(line.status)}</td>
                <td><code>${escapeHtml(line.snapshotLine)}</code></td>
                <td><code>${escapeHtml(line.currentLine)}</code></td>
              </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;

  return c.html(adminLayout("Snapshot Diff", user, body));
});

adminRoutes.get("/snapshots/:id/confirm-restore", async (c) => {
  const user = c.get("sessionUser");
  const diff = await getFileSnapshotDiff(Number(c.req.param("id")));
  const changedCount = diff.lines.filter((line) => line.status !== "same").length;
  const body = `
    <div class="row" style="margin-bottom:16px;">
      <a class="button" href="${config.controlPanelPath}/snapshots/${c.req.param("id")}/preview">Back to diff</a>
      <a class="button" href="${config.controlPanelPath}/snapshots">Back to snapshots</a>
    </div>
    <h2>Confirm restore</h2>
    <p>This will overwrite the current file at <code>${escapeHtml(diff.relativePath)}</code> with the contents stored in snapshot #${c.req.param("id")}.</p>
    <p class="meta">Changed lines detected: ${changedCount}</p>
    <p class="meta">Current file exists: ${diff.currentExists ? "yes" : "no"}</p>
    <form method="post" action="${config.controlPanelPath}/snapshots/${c.req.param("id")}/restore" class="form-grid" style="max-width:560px;">
      <label>Type RESTORE to confirm
        <input name="confirmText" placeholder="RESTORE" required />
      </label>
      <div class="row">
        <button class="button button-primary" type="submit">Restore snapshot now</button>
      </div>
    </form>
  `;

  return c.html(adminLayout("Confirm Restore", user, body));
});

adminRoutes.post("/snapshots/:id/restore", async (c) => {
  const user = c.get("sessionUser");
  if (!user) {
    return c.redirect("/login");
  }

  const form = await c.req.formData();
  const confirmText = String(form.get("confirmText") ?? "");
  if (confirmText !== "RESTORE") {
    return c.redirect(`${config.controlPanelPath}/snapshots?error=${encodeURIComponent("Confirmation text did not match.")}`);
  }

  let restored;
  try {
    restored = await restoreFileSnapshot(Number(c.req.param("id")));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to restore snapshot.";
    return c.redirect(`${config.controlPanelPath}/snapshots?error=${encodeURIComponent(message)}`);
  }
  await writeAuditLog({
    actorUserId: user.id,
    action: "snapshot.restore",
    targetType: "file_snapshot",
    targetId: c.req.param("id"),
    summary: `Restored snapshot to "${restored.relativePath}".`,
    ipAddress: requestIp(c),
  });

  return c.redirect(`${config.controlPanelPath}/snapshots?success=${encodeURIComponent(`Restored ${restored.relativePath}.`)}`);
});
