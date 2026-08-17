import { Hono } from "hono";
import { requestIp, writeAuditLog } from "../../core/audit";
import { escapeHtml, slugify } from "../../core/content";
import { verifyRecaptchaToken } from "../../core/security";
import {
  createForm,
  createFormSubmission,
  deleteForm,
  getFormBySlug,
  listForms,
  validateFormSubmission,
  updateForm,
} from "../../core/forms";
import { deleteMedia, listMedia, uploadMedia } from "../../core/media";
import { createPage, deletePage, getPageById, getPageBySlug, listPages, updatePage } from "../../core/pages";
import { createPost, deletePost, getPostById, getPostBySlug, listPosts, updatePost } from "../../core/posts";
import { renderPublishedArtifacts } from "../../core/renderer";
import { getMenuBySlug, listMenus } from "../../core/menus";
import { getPublishedBlockBySlug, listBlocks } from "../../core/blocks";
import { createAiFileProposal } from "../../core/aiProposals";
import { hasPermission, requireApiPermission } from "../../core/permissions";
import { consumeFormSubmissionRateLimit, consumeSubmissionRateLimit } from "../../core/formRateLimit";
import { config } from "../../core/config";
import { sendFormSubmissionEmail } from "../../core/email";
import { createOperatorNotification } from "../../core/notifications";
import { AppValidationError } from "../../core/validation";
import { publicTranslations } from "../../core/i18n";
import { createPendingComment } from "../../core/comments";
import { getPostPermalinkPattern } from "../../core/settings";
import { postPermalinkPath } from "../../core/permalinks";
import { scheduleTimestampForStorage } from "../../core/scheduling";
import { getPublishedMapBySlug, listMaps } from "../../core/maps";
import { syncPageUrlRedirect, syncPostUrlRedirect } from "../../core/redirects";
import { logError } from "../../core/logger";
import { searchContent } from "../../core/search";

export const apiRoutes = new Hono();

function optionalRelationId(payload: Record<string, unknown>, key: string) {
  if (!(key in payload)) return undefined;
  const id = Number(payload[key]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function publicMapRecord(map: Awaited<ReturnType<typeof listMaps>>[number]) {
  const { createdBy: _createdBy, ...publicRecord } = map;
  return publicRecord;
}

apiRoutes.use("/*", requireApiPermission());

apiRoutes.get("/posts", async (c) => {
  const page = Number(c.req.query("page") ?? 1);
  const limit = Number(c.req.query("limit") ?? 10);
  const category = c.req.query("category");
  const requestedStatus = c.req.query("status") ?? "published";
  const status = ["draft", "published", "scheduled", "any"].includes(requestedStatus) &&
    (requestedStatus === "published" || hasPermission(c.get("sessionUser"), "posts.read"))
    ? requestedStatus
    : "published";
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
  const requestedStatus = c.req.query("status") ?? "published";
  const status = ["draft", "published", "scheduled", "any"].includes(requestedStatus) &&
    (requestedStatus === "published" || hasPermission(c.get("sessionUser"), "pages.read"))
    ? requestedStatus
    : "published";
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
  const limit = Number(c.req.query("limit") ?? 20);
  const type = c.req.query("type") ?? "posts";
  if (type === "all") return c.json(await searchContent(q, { status: "published", limit }));
  if (type === "pages") return c.json(await listPages({ page: 1, limit, status: "published", search: q }));
  return c.json(await listPosts({ page: 1, limit, status: "published", search: q }));
});

apiRoutes.get("/media", async (c) => {
  const items = await listMedia();
  return c.json({ items });
});

apiRoutes.get("/forms", async (c) => {
  const requestedStatus = c.req.query("status") ?? "published";
  const status = (["draft", "published", "any"].includes(requestedStatus) &&
    (requestedStatus === "published" || hasPermission(c.get("sessionUser"), "forms.read"))
    ? requestedStatus
    : "published") as "published" | "draft" | "any";
  const items = await listForms(status);
  return c.json({ items });
});

apiRoutes.get("/forms/:slug", async (c) => {
  const form = await getFormBySlug(c.req.param("slug"));
  if (!form) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json(form);
});

apiRoutes.get("/menus", async (c) => {
  return c.json({ items: await listMenus("published") });
});

apiRoutes.get("/menus/:slug", async (c) => {
  const menu = await getMenuBySlug(c.req.param("slug"));
  return menu ? c.json(menu) : c.json({ error: "Not found" }, 404);
});

apiRoutes.get("/blocks", async (c) => c.json({ items: await listBlocks("published") }));
apiRoutes.get("/blocks/:slug", async (c) => {
  const block = await getPublishedBlockBySlug(c.req.param("slug"));
  return block ? c.json(block) : c.json({ error: "Not found" }, 404);
});

apiRoutes.get("/maps", async (c) => c.json({ items: (await listMaps("published")).map(publicMapRecord) }));
apiRoutes.get("/maps/:slug", async (c) => {
  const map = await getPublishedMapBySlug(c.req.param("slug"));
  return map ? c.json(publicMapRecord(map)) : c.json({ error: "Not found" }, 404);
});

apiRoutes.post("/ai/proposals", async (c) => {
  const user = c.get("sessionUser");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const payload = await c.req.json();
    const proposal = await createAiFileProposal({ relativePath: String(payload.relativePath ?? ""), proposedContent: String(payload.proposedContent ?? ""), reason: String(payload.reason ?? "") }, user.id);
    await writeAuditLog({ actorUserId: user.id, action: "ai.proposal.create", targetType: "ai_file_proposal", targetId: proposal.id, summary: `Created AI proposal for "${proposal.relativePath}".`, ipAddress: requestIp(c) });
    return c.json({ proposal }, 201);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid proposal" }, 400);
  }
});

apiRoutes.post("/posts", async (c) => {
  const user = c.get("sessionUser");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const payload = await c.req.json();
  const status = payload.status ?? "draft";
  if (status !== "draft" && !hasPermission(user, "posts.publish")) return c.json({ error: "Publishing posts is not permitted for this user." }, 403);
  const post = await createPost(
    {
      title: payload.title,
      slug: payload.slug || slugify(payload.title),
      excerpt: payload.excerpt,
      bodyMd: payload.bodyMd,
      bodyHtml: payload.bodyHtml,
      status,
      seoTitle: payload.seoTitle,
      seoDescription: payload.seoDescription,
      seoCanonicalUrl: payload.seoCanonicalUrl,
      seoOgImage: payload.seoOgImage,
      seoKeywords: payload.seoKeywords,
      seoNoindex: Boolean(payload.seoNoindex),
      seoNofollow: Boolean(payload.seoNofollow),
      publishedAt: scheduleTimestampForStorage(payload.publishedAt, config.scheduleTimeZone),
      categorySlugs: payload.categorySlugs ?? [],
      tagSlugs: payload.tagSlugs ?? [],
      seriesId: optionalRelationId(payload, "seriesId"),
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
  const status = payload.status ?? "draft";
  if (status !== "draft" && !hasPermission(user, "posts.publish")) return c.json({ error: "Publishing posts is not permitted for this user." }, 403);
  const existing = await getPostById(Number(c.req.param("id")));
  if (!existing) return c.json({ error: "Not found" }, 404);
  const input = {
    title: payload.title,
    slug: payload.slug || slugify(payload.title),
    excerpt: payload.excerpt,
    bodyMd: payload.bodyMd,
    bodyHtml: payload.bodyHtml,
    status,
    seoTitle: payload.seoTitle,
    seoDescription: payload.seoDescription,
    seoCanonicalUrl: payload.seoCanonicalUrl,
    seoOgImage: payload.seoOgImage,
    seoKeywords: payload.seoKeywords,
    seoNoindex: Boolean(payload.seoNoindex),
    seoNofollow: Boolean(payload.seoNofollow),
    publishedAt: scheduleTimestampForStorage(payload.publishedAt, config.scheduleTimeZone),
    categorySlugs: payload.categorySlugs ?? [],
    tagSlugs: payload.tagSlugs ?? [],
    seriesId: optionalRelationId(payload, "seriesId"),
  } as const;
  let post;
  try {
    post = await updatePost(Number(c.req.param("id")), input, user.id);
  } catch (error) {
    if (error instanceof AppValidationError) return c.json({ error: error.message }, 409);
    throw error;
  }
  if (post) {
    try {
      await syncPostUrlRedirect(existing, post, await getPostPermalinkPattern(), user.id);
    } catch (error) {
      logError("redirect.post_sync_failed", "API post update succeeded but its automatic URL redirect could not be synchronized.", { error, postId: c.req.param("id") });
    }
  }

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
  const status = payload.status ?? "draft";
  if (status !== "draft" && !hasPermission(user, "pages.publish")) return c.json({ error: "Publishing pages is not permitted for this user." }, 403);
  const page = await createPage(
    {
      title: payload.title,
      slug: payload.slug || slugify(payload.title),
      excerpt: payload.excerpt,
      bodyMd: payload.bodyMd,
      bodyHtml: payload.bodyHtml,
      status,
      seoTitle: payload.seoTitle,
      seoDescription: payload.seoDescription,
      seoCanonicalUrl: payload.seoCanonicalUrl,
      seoOgImage: payload.seoOgImage,
      seoKeywords: payload.seoKeywords,
      seoNoindex: Boolean(payload.seoNoindex),
      seoNofollow: Boolean(payload.seoNofollow),
      pageGroupId: optionalRelationId(payload, "pageGroupId"),
      stylesheetPath: payload.stylesheetPath,
      publishedAt: scheduleTimestampForStorage(payload.publishedAt, config.scheduleTimeZone),
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
  const status = payload.status ?? "draft";
  if (status !== "draft" && !hasPermission(user, "pages.publish")) return c.json({ error: "Publishing pages is not permitted for this user." }, 403);
  const pageId = Number(c.req.param("id"));
  const currentPage = await getPageById(pageId);
  if (!currentPage) return c.json({ error: "Not found" }, 404);
  const input = {
    title: payload.title,
    slug: payload.slug || slugify(payload.title),
    excerpt: payload.excerpt,
    bodyMd: payload.bodyMd,
    bodyHtml: payload.bodyHtml,
    status,
    seoTitle: payload.seoTitle,
    seoDescription: payload.seoDescription,
    seoCanonicalUrl: payload.seoCanonicalUrl,
    seoOgImage: payload.seoOgImage,
    seoKeywords: payload.seoKeywords,
    seoNoindex: Boolean(payload.seoNoindex),
    seoNofollow: Boolean(payload.seoNofollow),
    pageGroupId: optionalRelationId(payload, "pageGroupId"),
    stylesheetPath: payload.stylesheetPath,
    publishedAt: scheduleTimestampForStorage(payload.publishedAt, config.scheduleTimeZone),
  } as const;
  let page;
  try {
    page = await updatePage(pageId, input, user.id);
  } catch (error) {
    if (error instanceof AppValidationError) return c.json({ error: error.message }, 409);
    throw error;
  }
  if (page) {
    try {
      await syncPageUrlRedirect(currentPage, page, user.id);
    } catch (error) {
      logError("redirect.page_sync_failed", "API page update succeeded but its automatic URL redirect could not be synchronized.", { error, pageId });
    }
  }

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

  try {
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
  } catch (error) {
    if (error instanceof AppValidationError) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
});

apiRoutes.delete("/media/:id", async (c) => {
  const user = c.get("sessionUser");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    await deleteMedia(Number(c.req.param("id")));
  } catch (error) {
    if (error instanceof AppValidationError) {
      return c.json({ error: error.message }, 409);
    }
    throw error;
  }
  await writeAuditLog({
    actorUserId: user.id,
    action: "media.delete",
    targetType: "media",
    targetId: c.req.param("id"),
    summary: `Deleted unused media #${c.req.param("id")}.`,
    ipAddress: requestIp(c),
  });
  return c.json({ ok: true });
});

apiRoutes.post("/forms", async (c) => {
  const user = c.get("sessionUser");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const payload = await c.req.json();
  const form = await createForm(
    {
      title: payload.title,
      slug: payload.slug || slugify(payload.title),
      description: payload.description,
      status: payload.status ?? "draft",
      submitLabel: payload.submitLabel,
      successMessage: payload.successMessage,
      fields: payload.fields ?? [],
    },
    user.id,
  );
  await writeAuditLog({
    actorUserId: user.id,
    action: "form.create",
    targetType: "form",
    targetId: form?.id ?? null,
    summary: `Created form "${form?.title ?? payload.title}".`,
    ipAddress: requestIp(c),
  });
  await renderPublishedArtifacts();
  return c.json(form, 201);
});

apiRoutes.put("/forms/:id", async (c) => {
  const user = c.get("sessionUser");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const payload = await c.req.json();
  const form = await updateForm(Number(c.req.param("id")), {
    title: payload.title,
    slug: payload.slug || slugify(payload.title),
    description: payload.description,
    status: payload.status ?? "draft",
    submitLabel: payload.submitLabel,
    successMessage: payload.successMessage,
    fields: payload.fields ?? [],
  });
  await writeAuditLog({
    actorUserId: user.id,
    action: "form.update",
    targetType: "form",
    targetId: c.req.param("id"),
    summary: `Updated form "${form?.title ?? payload.title}".`,
    ipAddress: requestIp(c),
  });
  await renderPublishedArtifacts();
  return c.json(form);
});

apiRoutes.delete("/forms/:id", async (c) => {
  const user = c.get("sessionUser");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await deleteForm(Number(c.req.param("id")));
  await writeAuditLog({
    actorUserId: user.id,
    action: "form.delete",
    targetType: "form",
    targetId: c.req.param("id"),
    summary: `Deleted form #${c.req.param("id")}.`,
    ipAddress: requestIp(c),
  });
  await renderPublishedArtifacts();
  return c.json({ ok: true });
});

apiRoutes.post("/comments/:postId/submit", async (c) => {
  const publicCopy = publicTranslations[config.publicLocale];
  const post = await getPostById(Number(c.req.param("postId")));
  if (!post || post.status !== "published" || !post.commentsEnabled) return c.json({ error: publicCopy.commentsClosed }, 403);

  const clientKey = requestIp(c) ?? "untrusted-client";
  if (!(await consumeSubmissionRateLimit("comment", post.id, clientKey))) {
    c.header("Retry-After", String(config.formRateLimitWindowSeconds));
    return c.json({ error: publicCopy.tooManySubmissions }, 429);
  }
  const contentLength = Number(c.req.header("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 65_536) return c.json({ error: publicCopy.submissionTooLarge }, 413);

  const formData = await c.req.formData();
  const recaptchaAction = `comment_submit_${post.id}`;
  const verification = await verifyRecaptchaToken(String(formData.get("recaptchaToken") ?? ""), recaptchaAction, requestIp(c));
  if (!verification.ok) {
    await writeAuditLog({ actorUserId: null, action: "comment.submit.blocked", targetType: "post", targetId: post.id, summary: `Blocked a comment submission for post "${post.title}".`, ipAddress: requestIp(c) });
    return c.html(`<p>${escapeHtml(publicCopy.spamSubmissionFailed)}</p>`, 400);
  }

  try {
    const commentId = await createPendingComment(post.id, {
      authorName: String(formData.get("authorName") ?? ""),
      authorEmail: String(formData.get("authorEmail") ?? ""),
      body: String(formData.get("body") ?? ""),
    });
    await writeAuditLog({ actorUserId: null, action: "comment.submit", targetType: "post_comment", targetId: commentId, summary: `Received a comment awaiting approval for post "${post.title}".`, ipAddress: requestIp(c) });
    await createOperatorNotification({ level: "info", action: "comment.submit", message: `A new comment on "${post.title}" is awaiting approval.` }).catch(() => undefined);
  } catch (error) {
    if (error instanceof AppValidationError) return c.html(`<p>${escapeHtml(publicCopy.commentInvalid)}</p>`, 400);
    throw error;
  }

  const returnPath = postPermalinkPath(post, await getPostPermalinkPattern());
  return c.html(`<main style="max-width:640px;margin:10vh auto;padding:24px;font-family:sans-serif"><h1>${escapeHtml(publicCopy.commentReceived)}</h1><p>${escapeHtml(publicCopy.commentPending)}</p><p><a href="${escapeHtml(returnPath)}#comments">${escapeHtml(publicCopy.backToArticle)}</a></p></main>`, 202);
});

apiRoutes.post("/forms/:slug/submit", async (c) => {
  const publicCopy = publicTranslations[config.publicLocale];
  const form = await getFormBySlug(c.req.param("slug"), "published");
  if (!form) {
    return c.json({ error: "Not found" }, 404);
  }
  const clientKey = requestIp(c) ?? "untrusted-client";
  if (!(await consumeFormSubmissionRateLimit(form.id, clientKey))) {
    await writeAuditLog({
      actorUserId: null,
      action: "form.submit.rate_limited",
      targetType: "form",
      targetId: form.id,
      summary: `Rate-limited submission for form "${form.title}".`,
      ipAddress: requestIp(c),
    });
    c.header("Retry-After", String(config.formRateLimitWindowSeconds));
    return c.json({ error: publicCopy.tooManySubmissions }, 429);
  }
  const contentLength = Number(c.req.header("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 1_048_576) {
    return c.json({ error: publicCopy.submissionTooLarge }, 413);
  }
  const formData = await c.req.formData();
  const recaptchaToken = String(formData.get("recaptchaToken") ?? "");
  const recaptchaAction = `form_submit_${form.slug.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const verification = await verifyRecaptchaToken(recaptchaToken, recaptchaAction, requestIp(c));
  if (!verification.ok) {
    await writeAuditLog({
      actorUserId: null,
      action: "form.submit.blocked",
      targetType: "form",
      targetId: form.id,
      summary: `Blocked submission for form "${form.title}" due to failed reCAPTCHA verification (${verification.reasons.join(", ") || "unknown"}).`,
      ipAddress: requestIp(c),
    });
    return c.html(`<p>${escapeHtml(publicCopy.spamSubmissionFailed)}</p>`, 400);
  }
  let payload: Record<string, string>;
  try {
    payload = validateFormSubmission(form, formData);
  } catch (error) {
    if (error instanceof AppValidationError) {
      return c.html(`<p>${escapeHtml(error.message)}</p>`, 400);
    }
    throw error;
  }
  await createFormSubmission(form.id, payload);
  try {
    await sendFormSubmissionEmail(form, payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown SMTP error";
    try {
      await createOperatorNotification({
        level: "error",
        action: "form.submit.email_failed",
        message: `Email notification failed for form "${form.title}": ${message.slice(0, 240)}`,
      });
    } catch {
      // Delivery failure must not turn a successfully stored submission into a visitor error.
    }
    try {
      await writeAuditLog({
        action: "form.submit.email_failed",
        targetType: "form",
        targetId: form.id,
        summary: `Email notification failed for form "${form.title}".`,
        ipAddress: requestIp(c),
      });
    } catch {
      // Keep the public form response available even if the database is temporarily degraded.
    }
  }
  await writeAuditLog({
    actorUserId: null,
    action: "form.submit",
    targetType: "form",
    targetId: form.id,
    summary: `Received submission for form "${form.title}".`,
    ipAddress: requestIp(c),
  });
  return c.html(`<p>${escapeHtml(form.successMessage)}</p>`);
});
