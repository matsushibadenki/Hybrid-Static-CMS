import { Hono } from "hono";
import type { Context } from "hono";
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
import { createManagedUser, getUserById, listUsers, managedRoles, resetUserPassword, revokeUserSessions, setUserActive, updateUserProfile } from "../../core/users";
import { hasPermission, requireAdminPermission } from "../../core/permissions";
import { config } from "../../core/config";
import { AppValidationError } from "../../core/validation";
import { getContentRevision, listContentRevisions } from "../../core/revisions";
import { createMenu, deleteMenu, getMenuById, listMenus, updateMenu } from "../../core/menus";
import { createBlock, deleteBlock, getBlockById, listBlocks, updateBlock } from "../../core/blocks";
import { getAiFileProposal, getAiProposalDiff, listAiFileProposals, reviewAiFileProposal } from "../../core/aiProposals";
import { listOperatorNotifications, markOperatorNotificationRead } from "../../core/notifications";
import type { FormFieldRecord, UserRole } from "../../core/types";

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
    const rollback = c.req.query("rollback");
    return noticeCard(success, "success") +
      (rollback
        ? `<p class="meta">A pre-restore snapshot was created automatically.</p><a class="button" href="${config.controlPanelPath}/snapshots/${escapeHtml(rollback)}/confirm-restore">Open rollback snapshot</a>`
        : "");
  }
  return "";
}

function userForm(action: string, values: { email?: string; displayName?: string; roles?: string[]; password?: string } = {}, includePassword = true) {
  const roleOptions = managedRoles
    .map((role) => `<label style="display:flex; align-items:center; gap:8px; font-weight:400;"><input style="width:auto;" type="checkbox" name="roles" value="${role}" ${values.roles?.includes(role) ? "checked" : ""} /> ${role}</label>`)
    .join("");
  return `
    <form method="post" action="${action}" class="form-grid">
      <label>Display name <input name="displayName" value="${escapeHtml(values.displayName ?? "")}" autocomplete="name" required /></label>
      <label>Email <input type="email" name="email" value="${escapeHtml(values.email ?? "")}" autocomplete="email" required /></label>
      ${includePassword ? `<label>Temporary password <input type="password" name="password" autocomplete="new-password" minlength="12" required /><span class="meta">Use at least 12 characters. Share it securely, then ask the user to change it.</span></label>` : ""}
      <fieldset style="border:1px solid var(--line); border-radius:16px; padding:14px;"><legend>Roles</legend><div class="form-grid">${roleOptions}</div></fieldset>
      <div class="row"><button class="button button-primary" type="submit">${includePassword ? "Create user" : "Save user"}</button></div>
    </form>
  `;
}

function userRolesFromForm(form: FormData) {
  return form.getAll("roles").map(String).filter((role): role is UserRole => managedRoles.includes(role as UserRole));
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
    seoCanonicalUrl: String(form.get("seoCanonicalUrl") ?? ""),
    seoOgImage: String(form.get("seoOgImage") ?? ""),
    seoKeywords: String(form.get("seoKeywords") ?? ""),
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
    seoCanonicalUrl: String(form.get("seoCanonicalUrl") ?? ""),
    seoOgImage: String(form.get("seoOgImage") ?? ""),
    seoKeywords: String(form.get("seoKeywords") ?? ""),
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

function richEditorTools(uploadUrl?: string) {
  return `
    <div data-rich-editor data-target="textarea[name=bodyHtml]" style="margin-top:-8px;">
      <div class="row" style="gap:8px;">
        <button class="button" type="button" data-prefix="<strong>" data-suffix="</strong>"><strong>B</strong></button>
        <button class="button" type="button" data-prefix="<em>" data-suffix="</em>"><em>I</em></button>
        <button class="button" type="button" data-prefix="<s>" data-suffix="</s>"><s>S</s></button>
        <button class="button" type="button" data-prefix="<blockquote>" data-suffix="</blockquote>">Quote</button>
        <button class="button" type="button" data-prefix="<ul>\n  <li>" data-suffix="</li>\n</ul>">Bullets</button>
        <button class="button" type="button" data-prefix="<ol>\n  <li>" data-suffix="</li>\n</ol>">Numbered</button>
        <button class="button" type="button" data-prefix="<h1>" data-suffix="</h1>">H1</button>
        <button class="button" type="button" data-prefix="<h2>" data-suffix="</h2>">H2</button>
        <button class="button" type="button" data-prefix="<h3>" data-suffix="</h3>">H3</button>
        <button class="button" type="button" data-prefix="<h4>" data-suffix="</h4>">H4</button>
        <button class="button" type="button" data-font-size="small">A-</button>
        <button class="button" type="button" data-font-size="normal">A</button>
        <button class="button" type="button" data-font-size="large">A+</button>
        <button class="button" type="button" data-font-size="xlarge">A++</button>
        <button class="button" type="button" data-ruby>Ruby</button>
        <button class="button" type="button" data-align="left">Left</button>
        <button class="button" type="button" data-align="center">Center</button>
        <button class="button" type="button" data-align="right">Right</button>
        <button class="button" type="button" data-align="justify">Justify</button>
        <button class="button" type="button" data-link>Link</button>
        <button class="button" type="button" data-prefix="<pre><code>" data-suffix="</code></pre>">Code</button>
        <button class="button" type="button" data-prefix="<hr />" data-suffix="">Rule</button>
        <button class="button" type="button" data-prefix="\\(" data-suffix="\\)">Math</button>
        <button class="button" type="button" data-prefix="\\[\n" data-suffix="\n\\]">Math block</button>
        <button class="button" type="button" data-prefix="<pre><code class=&quot;language-mermaid&quot;>graph TD\n  A[Start] --> B[End]" data-suffix="</code></pre>">Mermaid</button>
      </div>
      ${uploadUrl ? `<div class="row" style="margin-top:10px; align-items:center;"><label class="button" style="display:inline-flex; cursor:pointer;">Upload file <input type="file" data-editor-upload accept="image/*,video/*,audio/*,application/pdf,text/plain" style="display:none;" /></label><span class="meta" data-upload-status>Images, video, audio, PDF, and text files</span></div>` : ""}
    </div>
    <script>
      document.querySelectorAll("[data-rich-editor]").forEach((toolbar) => {
        const target = document.querySelector(toolbar.dataset.target);
        if (!target) return;
        toolbar.querySelectorAll("button[data-prefix]").forEach((button) => {
          button.addEventListener("click", () => {
            const prefix = button.dataset.prefix || "";
            const suffix = button.dataset.suffix || "";
            const start = target.selectionStart ?? target.value.length;
            const end = target.selectionEnd ?? start;
            const selected = target.value.slice(start, end) || "text";
            target.value = target.value.slice(0, start) + prefix + selected + suffix + target.value.slice(end);
            target.focus();
            target.selectionStart = start + prefix.length;
            target.selectionEnd = start + prefix.length + selected.length;
          });
        });
        toolbar.querySelectorAll("button[data-align]").forEach((button) => {
          button.addEventListener("click", () => {
            const align = button.dataset.align || "left";
            const start = target.selectionStart ?? target.value.length;
            const end = target.selectionEnd ?? start;
            const selected = target.value.slice(start, end) || "text";
            const replacement = '<p class="align-' + align + '">' + selected + '</p>';
            target.value = target.value.slice(0, start) + replacement + target.value.slice(end);
            target.focus();
            target.selectionStart = start;
            target.selectionEnd = start + replacement.length;
          });
        });
        toolbar.querySelectorAll("button[data-font-size]").forEach((button) => {
          button.addEventListener("click", () => {
            const size = button.dataset.fontSize || "normal";
            const start = target.selectionStart ?? target.value.length;
            const end = target.selectionEnd ?? start;
            const selected = target.value.slice(start, end) || "text";
            const replacement = '<span class="text-size-' + size + '">' + selected + '</span>';
            target.value = target.value.slice(0, start) + replacement + target.value.slice(end);
            target.focus();
            target.selectionStart = start;
            target.selectionEnd = start + replacement.length;
          });
        });
        toolbar.querySelector("button[data-ruby]")?.addEventListener("click", () => {
          const start = target.selectionStart ?? target.value.length;
          const end = target.selectionEnd ?? start;
          const selected = target.value.slice(start, end) || "漢字";
          const reading = window.prompt("Reading", "かんじ");
          if (!reading) return;
          const safeReading = reading.replace(/[<>]/g, "");
          const replacement = '<ruby>' + selected + '<rp>(</rp><rt>' + safeReading + '</rt><rp>)</rp></ruby>';
          target.value = target.value.slice(0, start) + replacement + target.value.slice(end);
          target.focus();
          target.selectionStart = start;
          target.selectionEnd = start + replacement.length;
        });
        toolbar.querySelector("button[data-link]")?.addEventListener("click", () => {
          const url = window.prompt("URL", "https://");
          if (!url) return;
          const start = target.selectionStart ?? target.value.length;
          const end = target.selectionEnd ?? start;
          const selected = target.value.slice(start, end) || "link text";
          const replacement = '<a href="' + url.replaceAll('"', '') + '" target="_blank" rel="noopener noreferrer">' + selected + '</a>';
          target.value = target.value.slice(0, start) + replacement + target.value.slice(end);
          target.focus();
          target.selectionStart = start;
          target.selectionEnd = start + replacement.length;
        });
        toolbar.querySelector("[data-editor-upload]")?.addEventListener("change", async (event) => {
          const input = event.currentTarget;
          const file = input.files?.[0];
          if (!file) return;
          const status = toolbar.querySelector("[data-upload-status]");
          if (status) status.textContent = "Uploading...";
          const data = new FormData();
          data.append("file", file);
          data.append("altText", file.name);
          try {
            const response = await fetch("${escapeHtml(uploadUrl ?? "")}", { method: "POST", body: data, credentials: "same-origin" });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || "Upload failed.");
            const start = target.selectionStart ?? target.value.length;
            const snippet = payload.snippet || payload.url;
            target.value = target.value.slice(0, start) + snippet + target.value.slice(start);
            target.focus();
            target.selectionStart = target.selectionEnd = start + snippet.length;
            if (status) status.textContent = "Uploaded and inserted: " + payload.name;
          } catch (error) {
            if (status) status.textContent = error.message || "Upload failed.";
          } finally {
            input.value = "";
          }
        });
      });
    </script>
  `;
}

function postForm(action: string, values?: Record<string, string>) {
  return `
    <form method="post" action="${action}" class="form-grid">
      <label>Title <input name="title" value="${escapeHtml(values?.title ?? "")}" required /></label>
      <label>Slug <input name="slug" value="${escapeHtml(values?.slug ?? "")}" placeholder="auto-generated if empty" /></label>
      <label>Excerpt <textarea name="excerpt">${escapeHtml(values?.excerpt ?? "")}</textarea></label>
      <label>Body (Markdown-like) <textarea name="bodyMd">${escapeHtml(values?.bodyMd ?? "")}</textarea></label>
      <label>Body HTML editor <textarea name="bodyHtml" rows="16" placeholder="Write HTML here, or use the toolbar below.">${escapeHtml(values?.bodyHtml ?? "")}</textarea></label>
      ${richEditorTools(`${config.controlPanelPath}/posts/media/upload`)}
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
      <label>Canonical URL <input name="seoCanonicalUrl" value="${escapeHtml(values?.seoCanonicalUrl ?? "")}" placeholder="auto-generated if empty" /></label>
      <label>OG image URL <input name="seoOgImage" value="${escapeHtml(values?.seoOgImage ?? "")}" /></label>
      <label>SEO keywords <input name="seoKeywords" value="${escapeHtml(values?.seoKeywords ?? "")}" placeholder="comma-separated" /></label>
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
      ${richEditorTools()}
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
      <label>Canonical URL <input name="seoCanonicalUrl" value="${escapeHtml(values?.seoCanonicalUrl ?? "")}" placeholder="auto-generated if empty" /></label>
      <label>OG image URL <input name="seoOgImage" value="${escapeHtml(values?.seoOgImage ?? "")}" /></label>
      <label>SEO keywords <input name="seoKeywords" value="${escapeHtml(values?.seoKeywords ?? "")}" placeholder="comma-separated" /></label>
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

function menuValuesFromForm(form: FormData) {
  return {
    title: String(form.get("title") ?? ""),
    slug: String(form.get("slug") ?? "") || slugify(String(form.get("title") ?? "")),
    status: String(form.get("status") ?? "draft"),
    itemsSpec: String(form.get("itemsSpec") ?? ""),
  };
}

function parseMenuItems(spec: string) {
  return spec
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label = "", url = "", openNewTab = "false"] = line.split("|");
      return { label: label.trim(), url: url.trim(), openNewTab: openNewTab.trim().toLowerCase() === "true" };
    });
}

function menuForm(action: string, values?: Record<string, string>) {
  return `
    <form method="post" action="${action}" class="form-grid">
      <label>Title <input name="title" value="${escapeHtml(values?.title ?? "")}" required /></label>
      <label>Slug <input name="slug" value="${escapeHtml(values?.slug ?? "")}" placeholder="main-navigation" required /></label>
      <label>Status
        <select name="status">
          <option value="draft" ${values?.status === "draft" ? "selected" : ""}>Draft</option>
          <option value="published" ${values?.status === "published" ? "selected" : ""}>Published</option>
        </select>
      </label>
      <label>Menu items
        <textarea name="itemsSpec" placeholder="Home|/|false\nAbout|/about.php|false\nExternal|https://example.com|true" required>${escapeHtml(values?.itemsSpec ?? "")}</textarea>
      </label>
      <p class="meta">One item per line: <code>label|url|openNewTab</code>. Use <code>true</code> for a new tab. JavaScript and data URLs are blocked.</p>
      <div class="row"><button class="button button-primary" type="submit">Save menu</button></div>
    </form>
  `;
}

function blockValuesFromForm(form: FormData) {
  return {
    title: String(form.get("title") ?? ""),
    slug: String(form.get("slug") ?? "") || slugify(String(form.get("title") ?? "")),
    status: String(form.get("status") ?? "draft"),
    bodyHtml: String(form.get("bodyHtml") ?? ""),
  };
}

function blockForm(action: string, values?: Record<string, string>) {
  return `
    <form method="post" action="${action}" class="form-grid">
      <label>Title <input name="title" value="${escapeHtml(values?.title ?? "")}" required /></label>
      <label>Slug <input name="slug" value="${escapeHtml(values?.slug ?? "")}" placeholder="footer-cta" required /></label>
      <label>Status
        <select name="status">
          <option value="draft" ${values?.status === "draft" ? "selected" : ""}>Draft</option>
          <option value="published" ${values?.status === "published" ? "selected" : ""}>Published</option>
        </select>
      </label>
      <label>Body HTML <textarea name="bodyHtml" required>${escapeHtml(values?.bodyHtml ?? "")}</textarea></label>
      ${richEditorTools()}
      <p class="meta">Use <code>[[block:slug]]</code> in a CMS-managed page body to include this block.</p>
      <div class="row"><button class="button button-primary" type="submit">Save block</button></div>
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
          <button class="button" type="button" data-insert-media data-media-snippet="${escapeHtml(mediaEmbedSnippet(item))}" style="margin-top:10px;">Insert into body HTML</button>
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
      <p class="meta">Select an asset to insert its safe embed snippet into the Body HTML field. Uploaded media remains under <code>/cms/uploads/</code>.</p>
      <div class="grid" style="grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));">
        ${cards || "<p>No uploaded media yet.</p>"}
      </div>
      <script>
        document.querySelectorAll("[data-insert-media]").forEach((button) => {
          button.addEventListener("click", () => {
            const textarea = document.querySelector('textarea[name="bodyHtml"]');
            if (!textarea) return;
            const snippet = button.dataset.mediaSnippet || "";
            const start = textarea.selectionStart ?? textarea.value.length;
            const end = textarea.selectionEnd ?? start;
            textarea.value = textarea.value.slice(0, start) + snippet + textarea.value.slice(end);
            textarea.focus();
            textarea.selectionStart = textarea.selectionEnd = start + snippet.length;
          });
        });
      </script>
    </div>
  `;
}

function revisionLinkCard(path: string) {
  return `
    <div style="margin-top:20px; padding:16px 18px; border-radius:18px; background:rgba(255,255,255,0.72); border:1px solid rgba(31,41,51,0.12);">
      <strong>Revision history</strong>
      <p class="meta">Updates keep the previous content so it can be reviewed or restored later.</p>
      <a class="button" href="${path}">Open revision history</a>
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

adminRoutes.use("/*", requireAdminPermission());

adminRoutes.get("/users", async (c) => {
  const user = c.get("sessionUser");
  const users = await listUsers();
  const canManageOwners = user?.roles.includes("owner") ?? false;
  const body = `
    ${queryNotice(c)}
    <div class="row" style="justify-content:space-between; margin-bottom:16px;">
      <div><h2>User directory</h2><p class="meta">Manage access without exposing passwords. Deactivating a user also signs them out.</p></div>
      <a class="button button-primary" href="${config.controlPanelPath}/users/new">New user</a>
    </div>
    <table>
      <thead><tr><th>User</th><th>Roles</th><th>Status</th><th>Last sign-in</th><th>Actions</th></tr></thead>
      <tbody>
        ${users.map((item) => `
          <tr>
            <td><strong>${escapeHtml(item.displayName)}</strong><br /><span class="meta">${escapeHtml(item.email)}</span></td>
            <td>${item.roles.map((role) => `<span style="display:inline-block; margin:2px 4px 2px 0; padding:4px 8px; border-radius:999px; background:rgba(20,99,86,.12);">${escapeHtml(role)}</span>`).join("") || "-"}</td>
            <td>${item.isActive ? "Active" : "Inactive"}</td>
            <td>${item.lastLoginAt ? escapeHtml(new Date(item.lastLoginAt).toLocaleString("en-US")) : "Never"}</td>
            <td>
              <div class="row">
                ${(canManageOwners || !item.roles.includes("owner")) ? `<a class="button" href="${config.controlPanelPath}/users/${item.id}/edit">Edit</a>` : ""}
                ${(item.id !== user?.id && (canManageOwners || !item.roles.includes("owner"))) ? `<form method="post" action="${config.controlPanelPath}/users/${item.id}/${item.isActive ? "deactivate" : "activate"}"><button class="button" type="submit">${item.isActive ? "Deactivate" : "Activate"}</button></form>` : ""}
              </div>
            </td>
          </tr>`).join("")}
      </tbody>
    </table>
  `;
  return c.html(adminLayout("Users", user, body));
});

adminRoutes.get("/users/new", (c) => {
  return c.html(adminLayout("New User", c.get("sessionUser"), queryNotice(c) + userForm(`${config.controlPanelPath}/users`)));
});

adminRoutes.post("/users", async (c) => {
  const actor = c.get("sessionUser");
  if (!actor) return c.redirect("/login");
  const form = await c.req.formData();
  const values = {
    displayName: String(form.get("displayName") ?? "").trim(),
    email: String(form.get("email") ?? "").trim().toLowerCase(),
    password: String(form.get("password") ?? ""),
    roles: userRolesFromForm(form),
  };
  try {
    if (!values.displayName || !values.email.includes("@")) throw new Error("Display name and a valid email are required.");
    if (values.password.length < 12) throw new Error("Password must contain at least 12 characters.");
    if (values.roles.includes("owner") && !actor.roles.includes("owner")) throw new Error("Only an owner can grant the owner role.");
    const id = await createManagedUser(values);
    await writeAuditLog({ actorUserId: actor.id, action: "user.create", targetType: "user", targetId: id, summary: `Created user "${values.email}".`, ipAddress: requestIp(c) });
    return c.redirect(`${config.controlPanelPath}/users?success=${encodeURIComponent("User created.")}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create user.";
    return c.html(adminLayout("New User", actor, noticeCard(message, "error") + userForm(`${config.controlPanelPath}/users`, values)), 400);
  }
});

adminRoutes.get("/users/:id/edit", async (c) => {
  const actor = c.get("sessionUser");
  const target = await getUserById(Number(c.req.param("id")));
  if (!target) return c.notFound();
  if (target.roles.includes("owner") && !actor?.roles.includes("owner")) return c.text("Forbidden", 403);
  const body = `
    ${queryNotice(c)}
    <div class="row" style="margin-bottom:16px;"><a class="button" href="${config.controlPanelPath}/users">Back to users</a></div>
    <h2>Edit profile</h2>
    ${userForm(`${config.controlPanelPath}/users/${target.id}`, target, false)}
    <hr style="border:0; border-top:1px solid var(--line); margin:28px 0;" />
    <h2>Security actions</h2>
    <form method="post" action="${config.controlPanelPath}/users/${target.id}/password" class="form-grid">
      <label>New password <input type="password" name="password" minlength="12" autocomplete="new-password" required /></label>
      <button class="button" type="submit">Reset password and sign out sessions</button>
    </form>
    <form method="post" action="${config.controlPanelPath}/users/${target.id}/revoke-sessions" style="margin-top:16px;">
      <button class="button" type="submit">Revoke all sessions</button>
    </form>
  `;
  return c.html(adminLayout("Edit User", actor, body));
});

adminRoutes.post("/users/:id", async (c) => {
  const actor = c.get("sessionUser");
  if (!actor) return c.redirect("/login");
  const id = Number(c.req.param("id"));
  const target = await getUserById(id);
  if (!target) return c.notFound();
  if (target.roles.includes("owner") && !actor.roles.includes("owner")) return c.text("Forbidden", 403);
  const form = await c.req.formData();
  const values = {
    displayName: String(form.get("displayName") ?? "").trim(),
    email: String(form.get("email") ?? "").trim().toLowerCase(),
    roles: userRolesFromForm(form),
  };
  try {
    if (!values.displayName || !values.email.includes("@")) throw new Error("Display name and a valid email are required.");
    if (values.roles.includes("owner") && !actor.roles.includes("owner")) throw new Error("Only an owner can grant the owner role.");
    if (target.roles.includes("owner") && !values.roles.includes("owner")) throw new Error("An owner must keep the owner role.");
    if (id === actor.id && !values.roles.some((role) => role === "owner" || role === "admin")) throw new Error("You cannot remove your own administrative access.");
    await updateUserProfile(id, values);
    await writeAuditLog({ actorUserId: actor.id, action: "user.update", targetType: "user", targetId: id, summary: `Updated user "${values.email}".`, ipAddress: requestIp(c) });
    return c.redirect(`${config.controlPanelPath}/users?success=${encodeURIComponent("User updated.")}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update user.";
    return c.html(adminLayout("Edit User", actor, noticeCard(message, "error") + userForm(`${config.controlPanelPath}/users/${id}`, values, false)), 400);
  }
});

async function changeUserActivity(c: Context, isActive: boolean) {
  const actor = c.get("sessionUser");
  if (!actor) return c.redirect("/login");
  const id = Number(c.req.param("id"));
  if (id === actor.id) return c.redirect(`${config.controlPanelPath}/users?error=${encodeURIComponent("You cannot deactivate your own account.")}`);
  const target = await getUserById(id);
  if (!target) return c.notFound();
  if (target.roles.includes("owner") && !actor.roles.includes("owner")) return c.text("Forbidden", 403);
  await setUserActive(id, isActive);
  await writeAuditLog({ actorUserId: actor.id, action: isActive ? "user.activate" : "user.deactivate", targetType: "user", targetId: id, summary: `${isActive ? "Activated" : "Deactivated"} user "${target.email}".`, ipAddress: requestIp(c) });
  return c.redirect(`${config.controlPanelPath}/users?success=${encodeURIComponent(isActive ? "User activated." : "User deactivated.")}`);
}

adminRoutes.post("/users/:id/activate", (c) => changeUserActivity(c, true));
adminRoutes.post("/users/:id/deactivate", (c) => changeUserActivity(c, false));

adminRoutes.post("/users/:id/password", async (c) => {
  const actor = c.get("sessionUser");
  if (!actor) return c.redirect("/login");
  const target = await getUserById(Number(c.req.param("id")));
  if (!target) return c.notFound();
  if (target.roles.includes("owner") && !actor.roles.includes("owner")) return c.text("Forbidden", 403);
  const password = String((await c.req.formData()).get("password") ?? "");
  if (password.length < 12) return c.redirect(`${config.controlPanelPath}/users/${target.id}/edit?error=${encodeURIComponent("Password must contain at least 12 characters.")}`);
  await resetUserPassword(target.id, password);
  await writeAuditLog({ actorUserId: actor.id, action: "user.password_reset", targetType: "user", targetId: target.id, summary: `Reset password for user "${target.email}" and revoked sessions.`, ipAddress: requestIp(c) });
  return c.redirect(`${config.controlPanelPath}/users/${target.id}/edit?success=${encodeURIComponent("Password reset and sessions revoked.")}`);
});

adminRoutes.post("/users/:id/revoke-sessions", async (c) => {
  const actor = c.get("sessionUser");
  if (!actor) return c.redirect("/login");
  const target = await getUserById(Number(c.req.param("id")));
  if (!target) return c.notFound();
  if (target.roles.includes("owner") && !actor.roles.includes("owner")) return c.text("Forbidden", 403);
  const count = await revokeUserSessions(target.id);
  await writeAuditLog({ actorUserId: actor.id, action: "user.sessions_revoke", targetType: "user", targetId: target.id, summary: `Revoked ${count} session(s) for user "${target.email}".`, ipAddress: requestIp(c) });
  return c.redirect(`${config.controlPanelPath}/users/${target.id}/edit?success=${encodeURIComponent(`${count} session(s) revoked.`)}`);
});

adminRoutes.get("/", async (c) => {
  const user = c.get("sessionUser");
  const stats = await getDashboardStats();
  const recent = await listPosts({ page: 1, limit: 8, status: "any" });
  const notifications = await listOperatorNotifications(8, true);

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
        <h2>Operator notifications</h2>
        ${notifications.map((notification) => `<div style="padding:12px 0; border-bottom:1px solid rgba(31,41,51,0.12);"><p style="margin:0 0 6px;">${escapeHtml(notification.message)}</p><p class="meta">${new Date(notification.createdAt).toLocaleString("en-US")} · ${escapeHtml(notification.action)}</p><form method="post" action="${config.controlPanelPath}/notifications/${notification.id}/read"><button class="button" type="submit">Mark as read</button></form></div>`).join("") || "<p class='meta'>No unread notifications.</p>"}
      </article>
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

adminRoutes.post("/notifications/:id/read", async (c) => {
  await markOperatorNotificationRead(Number(c.req.param("id")));
  return c.redirect(config.controlPanelPath);
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
    if (values.status !== "draft" && !hasPermission(user, "posts.publish")) throw new AppValidationError("You do not have permission to publish posts.");
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
        seoCanonicalUrl: values.seoCanonicalUrl,
        seoOgImage: values.seoOgImage,
        seoKeywords: values.seoKeywords,
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

adminRoutes.post("/posts/media/upload", async (c) => {
  const user = c.get("sessionUser");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ error: "File is required." }, 400);
  try {
    const media = await uploadMedia(file, String(form.get("altText") ?? file.name), user.id);
    if (!media) return c.json({ error: "Upload failed." }, 500);
    await writeAuditLog({ actorUserId: user.id, action: "media.upload", targetType: "media", targetId: media.id, summary: `Uploaded media "${file.name}" from the post editor.`, ipAddress: requestIp(c) });
    return c.json({ id: media.id, name: media.originalName, url: media.publicUrl, snippet: mediaEmbedSnippet(media) });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Upload failed." }, 400);
  }
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
        seoCanonicalUrl: post.seoCanonicalUrl ?? "",
        seoOgImage: post.seoOgImage ?? "",
        seoKeywords: post.seoKeywords ?? "",
        seoNoindex: post.seoNoindex ? "true" : "false",
        seoNofollow: post.seoNofollow ? "true" : "false",
      }) +
        snapshotHelperCard(`${config.controlPanelPath}/posts/${post.id}/edit`, [
          "index.html",
          "assets/site.css",
          "cms/posts/latest.html",
        ]) +
        mediaHelperCard(mediaItems) +
        revisionLinkCard(`${config.controlPanelPath}/posts/${post.id}/revisions`),
    ),
  );
});

adminRoutes.post("/posts/:id", async (c) => {
  const form = await c.req.formData();
  const user = c.get("sessionUser");
  const mediaItems = await listMedia();
  const values = postValuesFromForm(form);
  try {
    if (values.status !== "draft" && !hasPermission(user, "posts.publish")) throw new AppValidationError("You do not have permission to publish posts.");
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
      seoCanonicalUrl: values.seoCanonicalUrl,
      seoOgImage: values.seoOgImage,
      seoKeywords: values.seoKeywords,
      seoNoindex: values.seoNoindex === "true",
      seoNofollow: values.seoNofollow === "true",
    }, user?.id);
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
            mediaHelperCard(mediaItems) +
            revisionLinkCard(`${config.controlPanelPath}/posts/${c.req.param("id")}/revisions`),
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

adminRoutes.get("/posts/:id/revisions", async (c) => {
  const user = c.get("sessionUser");
  const post = await getPostById(Number(c.req.param("id")));
  if (!post) {
    return c.text("Not found", 404);
  }
  const revisions = await listContentRevisions("post", post.id);
  const body = `
    <div class="row" style="margin-bottom:16px;">
      <a class="button" href="${config.controlPanelPath}/posts/${post.id}/edit">Back to post</a>
    </div>
    <h2>${escapeHtml(post.title)}</h2>
    <p class="meta">Each entry is the previous state captured before an update.</p>
    <table>
      <thead><tr><th>Created</th><th>By</th><th>Title</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>
        ${revisions.map((revision) => {
          const snapshot = revision.snapshot as import("../../core/types").PostRecord;
          return `<tr>
            <td>${new Date(revision.createdAt).toLocaleString("en-US")}</td>
            <td>${escapeHtml(revision.creatorName ?? "System")}</td>
            <td>${escapeHtml(snapshot.title)}</td>
            <td>${escapeHtml(snapshot.status)}</td>
            <td><form method="post" action="${config.controlPanelPath}/posts/${post.id}/revisions/${revision.id}/restore"><button class="button" type="submit">Restore this revision</button></form></td>
          </tr>`;
        }).join("") || "<tr><td colspan='5'>No revisions yet.</td></tr>"}
      </tbody>
    </table>
  `;
  return c.html(adminLayout("Post Revisions", user, body));
});

adminRoutes.post("/posts/:id/revisions/:revisionId/restore", async (c) => {
  const user = c.get("sessionUser");
  const postId = Number(c.req.param("id"));
  const revision = await getContentRevision(Number(c.req.param("revisionId")));
  if (!revision || revision.contentType !== "post" || revision.contentId !== postId) {
    return c.text("Not found", 404);
  }
  const snapshot = revision.snapshot as import("../../core/types").PostRecord;
  await updatePost(postId, {
    title: snapshot.title,
    slug: snapshot.slug,
    excerpt: snapshot.excerpt ?? "",
    bodyMd: snapshot.bodyMd ?? "",
    bodyHtml: snapshot.bodyHtml,
    status: snapshot.status,
    publishedAt: snapshot.publishedAt,
    seoTitle: snapshot.seoTitle ?? "",
    seoDescription: snapshot.seoDescription ?? "",
    seoCanonicalUrl: snapshot.seoCanonicalUrl ?? "",
    seoOgImage: snapshot.seoOgImage ?? "",
    seoKeywords: snapshot.seoKeywords ?? "",
    seoNoindex: snapshot.seoNoindex,
    seoNofollow: snapshot.seoNofollow,
    categorySlugs: snapshot.categories,
    tagSlugs: snapshot.tags,
  }, user?.id);
  await writeAuditLog({
    actorUserId: user?.id ?? null,
    action: "post.revision.restore",
    targetType: "post",
    targetId: postId,
    summary: `Restored post revision #${revision.id}.`,
    ipAddress: requestIp(c),
  });
  await renderPublishedArtifacts();
  return c.redirect(`${config.controlPanelPath}/posts/${postId}/edit?success=${encodeURIComponent("Revision restored.")}`);
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
    if (values.status !== "draft" && !hasPermission(user, "pages.publish")) throw new AppValidationError("You do not have permission to publish pages.");
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
        seoCanonicalUrl: values.seoCanonicalUrl,
        seoOgImage: values.seoOgImage,
        seoKeywords: values.seoKeywords,
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
        seoCanonicalUrl: page.seoCanonicalUrl ?? "",
        seoOgImage: page.seoOgImage ?? "",
        seoKeywords: page.seoKeywords ?? "",
        seoNoindex: page.seoNoindex ? "true" : "false",
        seoNofollow: page.seoNofollow ? "true" : "false",
      }) +
        snapshotHelperCard(`${config.controlPanelPath}/pages/${page.id}/edit`, [
          "index.html",
          "about.php",
          `cms/pages/${page.slug}.html`,
        ]) +
        mediaHelperCard(mediaItems) +
        revisionLinkCard(`${config.controlPanelPath}/pages/${page.id}/revisions`),
    ),
  );
});

adminRoutes.post("/pages/:id", async (c) => {
  const form = await c.req.formData();
  const user = c.get("sessionUser");
  const mediaItems = await listMedia();
  const values = pageValuesFromForm(form);
  try {
    if (values.status !== "draft" && !hasPermission(user, "pages.publish")) throw new AppValidationError("You do not have permission to publish pages.");
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
      seoCanonicalUrl: values.seoCanonicalUrl,
      seoOgImage: values.seoOgImage,
      seoKeywords: values.seoKeywords,
      seoNoindex: values.seoNoindex === "true",
      seoNofollow: values.seoNofollow === "true",
    }, user?.id);
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
            mediaHelperCard(mediaItems) +
            revisionLinkCard(`${config.controlPanelPath}/pages/${c.req.param("id")}/revisions`),
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

adminRoutes.get("/pages/:id/revisions", async (c) => {
  const user = c.get("sessionUser");
  const page = await getPageById(Number(c.req.param("id")));
  if (!page) {
    return c.text("Not found", 404);
  }
  const revisions = await listContentRevisions("page", page.id);
  const body = `
    <div class="row" style="margin-bottom:16px;">
      <a class="button" href="${config.controlPanelPath}/pages/${page.id}/edit">Back to page</a>
    </div>
    <h2>${escapeHtml(page.title)}</h2>
    <p class="meta">Each entry is the previous state captured before an update.</p>
    <table>
      <thead><tr><th>Created</th><th>By</th><th>Title</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>
        ${revisions.map((revision) => {
          const snapshot = revision.snapshot as import("../../core/types").PageRecord;
          return `<tr>
            <td>${new Date(revision.createdAt).toLocaleString("en-US")}</td>
            <td>${escapeHtml(revision.creatorName ?? "System")}</td>
            <td>${escapeHtml(snapshot.title)}</td>
            <td>${escapeHtml(snapshot.status)}</td>
            <td><form method="post" action="${config.controlPanelPath}/pages/${page.id}/revisions/${revision.id}/restore"><button class="button" type="submit">Restore this revision</button></form></td>
          </tr>`;
        }).join("") || "<tr><td colspan='5'>No revisions yet.</td></tr>"}
      </tbody>
    </table>
  `;
  return c.html(adminLayout("Page Revisions", user, body));
});

adminRoutes.post("/pages/:id/revisions/:revisionId/restore", async (c) => {
  const user = c.get("sessionUser");
  const pageId = Number(c.req.param("id"));
  const revision = await getContentRevision(Number(c.req.param("revisionId")));
  if (!revision || revision.contentType !== "page" || revision.contentId !== pageId) {
    return c.text("Not found", 404);
  }
  const snapshot = revision.snapshot as import("../../core/types").PageRecord;
  await updatePage(pageId, {
    title: snapshot.title,
    slug: snapshot.slug,
    excerpt: snapshot.excerpt ?? "",
    bodyMd: snapshot.bodyMd ?? "",
    bodyHtml: snapshot.bodyHtml,
    status: snapshot.status,
    publishedAt: snapshot.publishedAt,
    seoTitle: snapshot.seoTitle ?? "",
    seoDescription: snapshot.seoDescription ?? "",
    seoCanonicalUrl: snapshot.seoCanonicalUrl ?? "",
    seoOgImage: snapshot.seoOgImage ?? "",
    seoKeywords: snapshot.seoKeywords ?? "",
    seoNoindex: snapshot.seoNoindex,
    seoNofollow: snapshot.seoNofollow,
  }, user?.id);
  await writeAuditLog({
    actorUserId: user?.id ?? null,
    action: "page.revision.restore",
    targetType: "page",
    targetId: pageId,
    summary: `Restored page revision #${revision.id}.`,
    ipAddress: requestIp(c),
  });
  await renderPublishedArtifacts();
  return c.redirect(`${config.controlPanelPath}/pages/${pageId}/edit?success=${encodeURIComponent("Revision restored.")}`);
});

adminRoutes.get("/menus", async (c) => {
  const user = c.get("sessionUser");
  const menus = await listMenus("any");
  const body = `
    ${queryNotice(c)}
    <div class="row" style="margin-bottom:16px;"><a class="button button-primary" href="${config.controlPanelPath}/menus/new">New menu</a></div>
    <table>
      <thead><tr><th>Title</th><th>Slug</th><th>Status</th><th>Items</th><th>Actions</th></tr></thead>
      <tbody>
        ${menus.map((menu) => `<tr>
          <td>${escapeHtml(menu.title)}</td>
          <td><code>${escapeHtml(menu.slug)}</code></td>
          <td>${escapeHtml(menu.status)}</td>
          <td>${menu.items.length}</td>
          <td><div class="row"><a class="button" href="${config.controlPanelPath}/menus/${menu.id}/edit">Edit</a><form method="post" action="${config.controlPanelPath}/menus/${menu.id}/delete"><button class="button" type="submit">Delete</button></form></div></td>
        </tr>`).join("") || "<tr><td colspan='5'>No menus yet.</td></tr>"}
      </tbody>
    </table>
    <p class="meta">Published menus are generated at <code>/cms/menus/{slug}.html</code> and are also available through <code>/cms-api/menus</code>.</p>
  `;
  return c.html(adminLayout("Menus", user, body));
});

adminRoutes.get("/menus/new", (c) => {
  return c.html(adminLayout("New Menu", c.get("sessionUser"), queryNotice(c) + menuForm(`${config.controlPanelPath}/menus`)));
});

adminRoutes.post("/menus", async (c) => {
  const user = c.get("sessionUser");
  if (!user) return c.redirect("/login");
  const form = await c.req.formData();
  const values = menuValuesFromForm(form);
  try {
    const menu = await createMenu({
      title: values.title,
      slug: values.slug,
      status: values.status as "draft" | "published",
      items: parseMenuItems(values.itemsSpec),
    }, user.id);
    await writeAuditLog({ actorUserId: user.id, action: "menu.create", targetType: "menu", targetId: menu?.id ?? null, summary: `Created menu "${values.title}".`, ipAddress: requestIp(c) });
    await renderPublishedArtifacts();
    return c.redirect(`${config.controlPanelPath}/menus?success=${encodeURIComponent("Menu saved.")}`);
  } catch (error) {
    if (error instanceof AppValidationError) return c.html(adminLayout("New Menu", user, noticeCard(error.message, "error") + menuForm(`${config.controlPanelPath}/menus`, values)), 400);
    throw error;
  }
});

adminRoutes.get("/menus/:id/edit", async (c) => {
  const menu = await getMenuById(Number(c.req.param("id")));
  if (!menu) return c.text("Not found", 404);
  const values = {
    title: menu.title,
    slug: menu.slug,
    status: menu.status,
    itemsSpec: menu.items.map((item) => `${item.label}|${item.url}|${item.openNewTab ? "true" : "false"}`).join("\n"),
  };
  return c.html(adminLayout("Edit Menu", c.get("sessionUser"), queryNotice(c) + menuForm(`${config.controlPanelPath}/menus/${menu.id}`, values)));
});

adminRoutes.post("/menus/:id", async (c) => {
  const user = c.get("sessionUser");
  if (!user) return c.redirect("/login");
  const form = await c.req.formData();
  const values = menuValuesFromForm(form);
  try {
    const menu = await updateMenu(Number(c.req.param("id")), {
      title: values.title,
      slug: values.slug,
      status: values.status as "draft" | "published",
      items: parseMenuItems(values.itemsSpec),
    });
    await writeAuditLog({ actorUserId: user.id, action: "menu.update", targetType: "menu", targetId: c.req.param("id"), summary: `Updated menu "${values.title}".`, ipAddress: requestIp(c) });
    await renderPublishedArtifacts();
    return c.redirect(`${config.controlPanelPath}/menus/${menu?.id ?? c.req.param("id")}/edit?success=${encodeURIComponent("Menu updated.")}`);
  } catch (error) {
    if (error instanceof AppValidationError) return c.html(adminLayout("Edit Menu", user, noticeCard(error.message, "error") + menuForm(`${config.controlPanelPath}/menus/${c.req.param("id")}`, values)), 400);
    throw error;
  }
});

adminRoutes.post("/menus/:id/delete", async (c) => {
  const user = c.get("sessionUser");
  await deleteMenu(Number(c.req.param("id")));
  await writeAuditLog({ actorUserId: user?.id ?? null, action: "menu.delete", targetType: "menu", targetId: c.req.param("id"), summary: `Deleted menu #${c.req.param("id")}.`, ipAddress: requestIp(c) });
  await renderPublishedArtifacts();
  return c.redirect(`${config.controlPanelPath}/menus?success=${encodeURIComponent("Menu deleted.")}`);
});

adminRoutes.get("/blocks", async (c) => {
  const user = c.get("sessionUser");
  const blocks = await listBlocks("any");
  const body = `
    ${queryNotice(c)}
    <div class="row" style="margin-bottom:16px;"><a class="button button-primary" href="${config.controlPanelPath}/blocks/new">New block</a></div>
    <table>
      <thead><tr><th>Title</th><th>Slug</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead>
      <tbody>
        ${blocks.map((block) => `<tr>
          <td>${escapeHtml(block.title)}</td>
          <td><code>${escapeHtml(block.slug)}</code></td>
          <td>${escapeHtml(block.status)}</td>
          <td>${new Date(block.updatedAt).toLocaleString("en-US")}</td>
          <td><div class="row"><a class="button" href="${config.controlPanelPath}/blocks/${block.id}/edit">Edit</a><form method="post" action="${config.controlPanelPath}/blocks/${block.id}/delete"><button class="button" type="submit">Delete</button></form></div></td>
        </tr>`).join("") || "<tr><td colspan='5'>No blocks yet.</td></tr>"}
      </tbody>
    </table>
  `;
  return c.html(adminLayout("Reusable Blocks", user, body));
});

adminRoutes.get("/blocks/new", (c) => c.html(adminLayout("New Block", c.get("sessionUser"), queryNotice(c) + blockForm(`${config.controlPanelPath}/blocks`))));

adminRoutes.post("/blocks", async (c) => {
  const user = c.get("sessionUser");
  if (!user) return c.redirect("/login");
  const form = await c.req.formData();
  const values = blockValuesFromForm(form);
  try {
    const block = await createBlock({ title: values.title, slug: values.slug, bodyHtml: values.bodyHtml, status: values.status as "draft" | "published" }, user.id);
    await writeAuditLog({ actorUserId: user.id, action: "block.create", targetType: "content_block", targetId: block?.id ?? null, summary: `Created block "${values.title}".`, ipAddress: requestIp(c) });
    await renderPublishedArtifacts();
    return c.redirect(`${config.controlPanelPath}/blocks?success=${encodeURIComponent("Block saved.")}`);
  } catch (error) {
    if (error instanceof AppValidationError) return c.html(adminLayout("New Block", user, noticeCard(error.message, "error") + blockForm(`${config.controlPanelPath}/blocks`, values)), 400);
    throw error;
  }
});

adminRoutes.get("/blocks/:id/edit", async (c) => {
  const block = await getBlockById(Number(c.req.param("id")));
  if (!block) return c.text("Not found", 404);
  return c.html(adminLayout("Edit Block", c.get("sessionUser"), queryNotice(c) + blockForm(`${config.controlPanelPath}/blocks/${block.id}`, {
    title: block.title, slug: block.slug, status: block.status, bodyHtml: block.bodyHtml,
  })));
});

adminRoutes.post("/blocks/:id", async (c) => {
  const user = c.get("sessionUser");
  if (!user) return c.redirect("/login");
  const form = await c.req.formData();
  const values = blockValuesFromForm(form);
  try {
    const block = await updateBlock(Number(c.req.param("id")), { title: values.title, slug: values.slug, bodyHtml: values.bodyHtml, status: values.status as "draft" | "published" });
    await writeAuditLog({ actorUserId: user.id, action: "block.update", targetType: "content_block", targetId: c.req.param("id"), summary: `Updated block "${values.title}".`, ipAddress: requestIp(c) });
    await renderPublishedArtifacts();
    return c.redirect(`${config.controlPanelPath}/blocks/${block?.id ?? c.req.param("id")}/edit?success=${encodeURIComponent("Block updated.")}`);
  } catch (error) {
    if (error instanceof AppValidationError) return c.html(adminLayout("Edit Block", user, noticeCard(error.message, "error") + blockForm(`${config.controlPanelPath}/blocks/${c.req.param("id")}`, values)), 400);
    throw error;
  }
});

adminRoutes.post("/blocks/:id/delete", async (c) => {
  const user = c.get("sessionUser");
  await deleteBlock(Number(c.req.param("id")));
  await writeAuditLog({ actorUserId: user?.id ?? null, action: "block.delete", targetType: "content_block", targetId: c.req.param("id"), summary: `Deleted block #${c.req.param("id")}.`, ipAddress: requestIp(c) });
  await renderPublishedArtifacts();
  return c.redirect(`${config.controlPanelPath}/blocks?success=${encodeURIComponent("Block deleted.")}`);
});

adminRoutes.get("/proposals", async (c) => {
  const user = c.get("sessionUser");
  const proposals = await listAiFileProposals("pending");
  const body = `
    ${queryNotice(c)}
    <h2>AI file proposals</h2>
    <p class="meta">AI agents can suggest public_html changes, but nothing is written until an operator reviews the diff and approves it.</p>
    <table><thead><tr><th>Created</th><th>Path</th><th>Reason</th><th>Actions</th></tr></thead><tbody>
      ${proposals.map((proposal) => `<tr><td>${new Date(proposal.createdAt).toLocaleString("en-US")}</td><td><code>${escapeHtml(proposal.relativePath)}</code></td><td>${escapeHtml(proposal.reason)}</td><td><a class="button" href="${config.controlPanelPath}/proposals/${proposal.id}">Review</a></td></tr>`).join("") || "<tr><td colspan='4'>No pending proposals.</td></tr>"}
    </tbody></table>
  `;
  return c.html(adminLayout("AI Proposals", user, body));
});

adminRoutes.get("/proposals/:id", async (c) => {
  const user = c.get("sessionUser");
  const proposal = await getAiFileProposal(Number(c.req.param("id")));
  if (!proposal) return c.text("Not found", 404);
  const lines = await getAiProposalDiff(proposal);
  const changed = lines.filter((line) => line.changed);
  const body = `
    <div class="row" style="margin-bottom:16px;"><a class="button" href="${config.controlPanelPath}/proposals">Back to proposals</a></div>
    <h2>Review proposal #${proposal.id}</h2>
    <p>Path: <code>${escapeHtml(proposal.relativePath)}</code></p><p>${escapeHtml(proposal.reason)}</p>
    <p class="meta">Changed lines: ${changed.length}. Protected paths and generated CMS directories cannot be proposed.</p>
    <table><thead><tr><th>Line</th><th>Current</th><th>Proposed</th></tr></thead><tbody>
      ${lines.slice(0, 300).map((line) => `<tr style="background:${line.changed ? "rgba(180,73,44,0.12)" : "transparent"};"><td>${line.lineNumber}</td><td style="white-space:pre-wrap;word-break:break-word;"><code>${escapeHtml(line.current)}</code></td><td style="white-space:pre-wrap;word-break:break-word;"><code>${escapeHtml(line.proposed)}</code></td></tr>`).join("")}
    </tbody></table>
    ${lines.length > 300 ? `<p class="meta">Only the first 300 lines are shown.</p>` : ""}
    ${proposal.status === "pending" ? `<div class="row" style="margin-top:16px;"><form method="post" action="${config.controlPanelPath}/proposals/${proposal.id}/approve"><button class="button button-primary" type="submit">Approve and apply</button></form><form method="post" action="${config.controlPanelPath}/proposals/${proposal.id}/reject"><button class="button" type="submit">Reject</button></form></div>` : `<p class="meta">This proposal is already ${escapeHtml(proposal.status)}.</p>`}
  `;
  return c.html(adminLayout("Review AI Proposal", user, body));
});

adminRoutes.post("/proposals/:id/approve", async (c) => {
  const user = c.get("sessionUser");
  if (!user) return c.redirect("/login");
  try {
    const result = await reviewAiFileProposal(Number(c.req.param("id")), "approved", user.id);
    await writeAuditLog({ actorUserId: user.id, action: "ai.proposal.approve", targetType: "ai_file_proposal", targetId: c.req.param("id"), summary: `Approved AI proposal for "${result.proposal.relativePath}".`, ipAddress: requestIp(c) });
    const snapshot = result.snapshotId ? `&rollback=${result.snapshotId}` : "";
    return c.redirect(`${config.controlPanelPath}/proposals?success=${encodeURIComponent("Proposal approved and applied.")}${snapshot}`);
  } catch (error) {
    return c.redirect(`${config.controlPanelPath}/proposals?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to approve proposal.")}`);
  }
});

adminRoutes.post("/proposals/:id/reject", async (c) => {
  const user = c.get("sessionUser");
  if (!user) return c.redirect("/login");
  try {
    const result = await reviewAiFileProposal(Number(c.req.param("id")), "rejected", user.id);
    await writeAuditLog({ actorUserId: user.id, action: "ai.proposal.reject", targetType: "ai_file_proposal", targetId: c.req.param("id"), summary: `Rejected AI proposal for "${result.proposal.relativePath}".`, ipAddress: requestIp(c) });
    return c.redirect(`${config.controlPanelPath}/proposals?success=${encodeURIComponent("Proposal rejected.")}`);
  } catch (error) {
    return c.redirect(`${config.controlPanelPath}/proposals?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to reject proposal.")}`);
  }
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
  const search = c.req.query("q") ?? "";
  const action = c.req.query("action") ?? "";
  const items = await listAuditLogs(150, search, action);
  const body = `
    <h2>Audit logs</h2>
    <p class="meta">Recent authentication, publishing, media, and regeneration events.</p>
    <form method="get" action="${config.controlPanelPath}/logs" class="form-grid" style="margin-bottom:16px;">
      <div class="row">
        <input name="q" value="${escapeHtml(search)}" placeholder="Search summary, target, or actor" />
        <input name="action" value="${escapeHtml(action)}" placeholder="Exact action, e.g. post.update" />
        <button class="button" type="submit">Filter</button>
      </div>
    </form>
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
  const changedLines = diff.lines.filter((line) => line.status !== "same");
  const maxVisibleLines = 240;
  const visibleLines =
    diff.lines.length > maxVisibleLines
      ? changedLines.slice(0, maxVisibleLines)
      : diff.lines;
  const body = `
    <div class="row" style="margin-bottom:16px;">
      <a class="button" href="${config.controlPanelPath}/snapshots">Back to snapshots</a>
      <a class="button button-primary" href="${config.controlPanelPath}/snapshots/${c.req.param("id")}/confirm-restore">Continue to restore</a>
    </div>
    <h2>Diff preview</h2>
    <p class="meta">Path: <code>${escapeHtml(diff.relativePath)}</code></p>
    <p class="meta">Reason: ${escapeHtml(diff.reason ?? "-")}</p>
    <p class="meta">Current file exists: ${diff.currentExists ? "yes" : "no"}. Total lines: ${diff.lines.length}. Changed lines: ${changedLines.length}.</p>
    ${diff.lines.length > maxVisibleLines ? `<p class="meta">This file is long, so only the first ${maxVisibleLines} changed lines are shown.</p>` : ""}
    <table>
      <thead><tr><th>Line</th><th>Status</th><th>Snapshot</th><th>Current file</th></tr></thead>
      <tbody>
        ${visibleLines
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
                <td style="white-space:pre-wrap; word-break:break-word;"><code>${escapeHtml(line.snapshotLine)}</code></td>
                <td style="white-space:pre-wrap; word-break:break-word;"><code>${escapeHtml(line.currentLine)}</code></td>
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
    restored = await restoreFileSnapshot(Number(c.req.param("id")), user.id);
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

  const rollbackQuery = restored.rollbackSnapshotId ? `&rollback=${restored.rollbackSnapshotId}` : "";
  return c.redirect(`${config.controlPanelPath}/snapshots?success=${encodeURIComponent(`Restored ${restored.relativePath}.`)}${rollbackQuery}`);
});
