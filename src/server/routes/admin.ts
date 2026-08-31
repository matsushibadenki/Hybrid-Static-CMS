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
  renderFormSubmissionsCsv,
  updateForm,
} from "../../core/forms";
import { adminDate, adminLayout } from "../../core/layout";
import {
  deleteMedia,
  deleteUnusedMedia,
  formatByteSize,
  getMediaStorageUsage,
  isAudioMedia,
  isImageMedia,
  isPdfMedia,
  isVideoMedia,
  listMedia,
  listMediaUsage,
  mediaEmbedSnippet,
  mediaPreviewUrl,
  mediaStorageState,
  mediaTotalSizeBytes,
  uploadMedia,
} from "../../core/media";
import { createPage, deletePage, getPageById, listPages, updatePage } from "../../core/pages";
import { createPost, deletePost, getPostById, listPosts, setPostCommentsPolicy, updatePost } from "../../core/posts";
import { renderPublishedArtifacts } from "../../core/renderer";
import { enqueuePublicRender } from "../../core/backgroundJobs";
import { buildScopedSlug, slugify, escapeHtml } from "../../core/content";
import { createManagedUser, getUserById, listUsers, managedRoles, resetUserPassword, resetUserTwoFactor, revokeUserSessions, setUserActive, updateUserProfile } from "../../core/users";
import { hasPermission, requireAdminPermission } from "../../core/permissions";
import { config } from "../../core/config";
import { AppValidationError } from "../../core/validation";
import { getContentRevision, listContentRevisions } from "../../core/revisions";
import { createMenu, deleteMenu, getMenuById, listMenus, updateMenu } from "../../core/menus";
import { contentBlockLayouts, createBlock, deleteBlock, getBlockById, isContentBlockLayout, listBlocks, updateBlock, type ContentBlockLayout } from "../../core/blocks";
import { blockPreviewScript } from "../../core/blockPreview";
import { getAiFileProposal, getAiProposalDiff, listAiFileProposals, reviewAiFileProposal } from "../../core/aiProposals";
import { listOperatorNotifications, markOperatorNotificationRead } from "../../core/notifications";
import { createPreviewToken } from "../../core/previews";
import { assignPostToSeries, createSeries, deleteSeries, getPostSeriesId, getSeriesById, listPostSeriesAssignments, listSeries, listSeriesPosts, removePostFromSeries, updateSeries } from "../../core/series";
import { assignPageToGroup, createPageGroup, deletePageGroup, getPageGroupById, getPageGroupId, listPageGroupAssignments, listPageGroupMembers, listPageGroups, removePageFromGroup, updatePageGroup } from "../../core/pageGroups";
import type { FormFieldRecord, SessionUser, UserRole } from "../../core/types";
import {
  defaultPublicThemeSettings,
  getPostPermalinkPattern,
  getPublicThemeSettings,
  setPostPermalinkPattern,
  setPublicThemeSettings,
  validatePublicThemeSettings,
  fontDeliveryModes,
  normalizeLocalFontFaces,
  type PublicThemeSettings,
} from "../../core/settings";
import { isPostPermalinkPattern, postPermalinkExample, postPermalinkPath, postPermalinkPatterns } from "../../core/permalinks";
import {
  clearNotFoundReports,
  createPermalinkPatternRedirects,
  createRedirect,
  deleteNotFoundReport,
  deleteRedirect,
  getNotFoundReportById,
  listNotFoundReports,
  listRedirects,
  syncPageUrlRedirect,
  syncPostUrlRedirect,
  updateRedirect,
} from "../../core/redirects";
import { approveComment, deleteComment, listComments } from "../../core/comments";
import { scheduleTimestampForInput, scheduleTimestampForStorage } from "../../core/scheduling";
import { logError } from "../../core/logger";
import { listStylesheets } from "../../core/assets";
import { deleteLocalFont, listLocalFontFiles, uploadLocalFont, type LocalFontFile } from "../../core/fonts";
import { listCategories, updateCategoryStylesheet } from "../../core/categories";
import {
  contentArchiveMaxBytes,
  createContentArchive,
  importContentArchive,
  parseContentArchive,
} from "../../core/contentPortability";
import {
  changeOwnPassword,
  confirmTotpEnrollment,
  disableTotp,
  getAccountSecurity,
  getPendingTotpEnrollment,
  regenerateRecoveryCodes,
  revokeOtherSessions,
  revokeOwnSession,
  startTotpEnrollment,
} from "../../core/accountSecurity";
import { deleteEditorAutosave, getEditorAutosave, saveEditorAutosave, type AutosaveContentType } from "../../core/autosaves";
import {
  approveContentReview,
  listEditorialWorkflowEvents,
  requestContentChanges,
  submitContentForReview,
  withdrawContentReview,
  type EditorialContentType,
  type EditorialWorkflowAction,
  type EditorialWorkflowEvent,
} from "../../core/editorialWorkflow";
import type { EditorialWorkflowState, PageRecord, PostRecord } from "../../core/types";
import { createMap, deleteMap, getMapById, listMaps, updateMap, type MapEmbedInput } from "../../core/maps";
import { getSearchDiagnostics, rebuildSearchIndexes, searchContent } from "../../core/search";
import { isPublicThemeKitId, publicThemeKits, themeSettingsForKit } from "../../core/themeKits";
import { contentLocales, localeLabels } from "../../core/locales";
import { apiKeyScopeOptions, createApiKey, listApiKeys, revokeApiKey } from "../../core/apiKeys";
import { getDatabaseHealth, runDatabaseAnalyze } from "../../core/databaseHealth";
import { getOperationalMetrics, operationalMetricNames } from "../../core/metrics";

function splitCsv(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function noticeCard(message: string, tone: "success" | "error" = "success") {
  const background = tone === "success" ? "rgba(65, 201, 180, 0.06)" : "rgba(224, 84, 78, 0.06)";
  const border = tone === "success" ? "rgba(65, 201, 180, 0.18)" : "rgba(224, 84, 78, 0.18)";
  const color = tone === "success" ? "#2a7a6e" : "#b4492c";
  return `
    <div style="margin-bottom:20px; padding:14px 18px; border-radius:10px; background:${background}; border:1px solid ${border}; color:${color}; font-size:0.9rem; line-height:1.5;">
      ${escapeHtml(message)}
    </div>
  `;
}

const workflowStateLabels: Record<EditorialWorkflowState, string> = {
  draft: "Review draft",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
};

const workflowActionLabels: Record<EditorialWorkflowAction, string> = {
  submit: "Submitted for review",
  approve: "Approved review",
  request_changes: "Requested changes",
  withdraw: "Withdrew review",
};

function workflowBadge(state: EditorialWorkflowState) {
  const label = workflowStateLabels[state];
  return `<span class="workflow-badge workflow-${state}" data-i18n="${label}">${label}</span>`;
}

function editorialWorkflowPanel(
  contentType: EditorialContentType,
  content: PostRecord | PageRecord,
  user: SessionUser | null,
  events: EditorialWorkflowEvent[],
) {
  const base = `${config.controlPanelPath}/${contentType === "post" ? "posts" : "pages"}/${content.id}/workflow`;
  const reviewPermission = contentType === "post" ? "posts.review" : "pages.review";
  const canReview = hasPermission(user, reviewPermission);
  const canWithdraw = Boolean(user && (canReview || user.id === content.authorId || user.id === content.reviewRequestedBy));
  const submitForm = content.workflowState === "draft" || content.workflowState === "changes_requested"
    ? `<form method="post" action="${base}/submit" class="workflow-action-form">
        <label><span data-i18n="Reviewer note">Reviewer note</span><textarea name="note" rows="2" placeholder="Optional context for the reviewer"></textarea></label>
        <button class="button" type="submit" data-i18n="Submit for review">Submit for review</button>
      </form>`
    : "";
  const reviewForms = content.workflowState === "in_review" && canReview
    ? `<form method="post" action="${base}/approve" class="workflow-action-form">
        <label><span data-i18n="Review note">Review note</span><textarea name="note" rows="2" placeholder="Optional approval note"></textarea></label>
        <button class="button button-primary" type="submit" data-i18n="Approve review">Approve review</button>
      </form>
      <form method="post" action="${base}/request_changes" class="workflow-action-form">
        <label><span data-i18n="Requested changes">Requested changes</span><textarea name="note" rows="2" required placeholder="Explain the requested changes"></textarea></label>
        <button class="button" type="submit" data-i18n="Request changes">Request changes</button>
      </form>`
    : "";
  const withdrawForm = content.workflowState === "in_review" && canWithdraw
    ? `<form method="post" action="${base}/withdraw"><button class="button" type="submit" data-i18n="Withdraw review">Withdraw review</button></form>`
    : "";
  const history = events.map((event) => `<li>
      <span data-i18n="${workflowActionLabels[event.action]}">${workflowActionLabels[event.action]}</span>
      <span class="meta">${escapeHtml(event.actorName ?? "System")} · ${adminDate(event.createdAt)}</span>
      ${event.note ? `<p>${escapeHtml(event.note)}</p>` : ""}
    </li>`).join("") || `<li class="meta" data-i18n="No workflow activity.">No workflow activity.</li>`;

  return `<section class="editor-section workflow-panel">
    <div class="section-heading-row"><div><p class="editor-section-kicker" data-i18n="Editorial workflow">Editorial workflow</p><h2 class="editor-section-title" data-i18n="Review and approval">Review and approval</h2></div>${workflowBadge(content.workflowState)}</div>
    <p class="meta" data-i18n="Review status is separate from publication status. Direct publishing remains available until review is requested.">Review status is separate from publication status. Direct publishing remains available until review is requested.</p>
    ${content.workflowNote ? `<div class="workflow-current-note"><strong data-i18n="Latest review note">Latest review note</strong><p>${escapeHtml(content.workflowNote)}</p></div>` : ""}
    <div class="workflow-actions">${submitForm}${reviewForms}${withdrawForm}</div>
    <details class="editor-collapsible"><summary><span data-i18n="Workflow history">Workflow history</span></summary><ol class="workflow-history">${history}</ol></details>
  </section>`;
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

const permalinkPatternLabels = {
  post_name: { title: "Post name", description: "Short and readable. This is the existing default structure." },
  year_month: { title: "Year and month", description: "Places articles under their publication year and month." },
  category: { title: "Category and post name", description: "Uses the first category, with uncategorized as the fallback." },
  numeric: { title: "Numeric ID", description: "Uses the stable database ID and does not change when a slug changes." },
} as const;

function permalinkSettingsForm(current: (typeof postPermalinkPatterns)[number], notice = "") {
  const options = postPermalinkPatterns.map((pattern) => {
    const item = permalinkPatternLabels[pattern];
    return `
      <label style="display:grid; grid-template-columns:auto minmax(0,1fr); gap:12px; align-items:start; padding:18px; border:1px solid var(--line);">
        <input style="width:auto; margin-top:4px;" type="radio" name="pattern" value="${pattern}" ${pattern === current ? "checked" : ""} />
        <span><strong style="display:block; margin-bottom:4px;">${item.title}</strong><span class="meta" style="display:block; margin-bottom:8px;">${item.description}</span><code>${postPermalinkExample(pattern)}</code></span>
      </label>`;
  }).join("");
  return `${notice}
    <section class="editor-section">
      <p class="editor-section-kicker">Publishing</p>
      <h2 class="editor-section-title">Post permalink structure</h2>
      <p class="meta">Choose the public URL structure for generated article pages. Existing posts keep their slugs; only generated paths and internal links change.</p>
      <form method="post" action="${config.controlPanelPath}/settings/permalinks" class="form-grid" style="margin-top:20px;">
        <fieldset style="border:0; padding:0; margin:0;" class="form-grid"><legend class="sr-only">Post permalink structure</legend>${options}</fieldset>
        <div style="padding:14px 16px; border-left:3px solid var(--accent); background:var(--accent-light);"><strong>Before changing</strong><p class="meta" style="margin:4px 0 0;">Update external links and redirects when changing an established site. Explicit canonical URLs remain unchanged.</p></div>
        <div class="row"><button class="button button-primary" type="submit">Save permalink structure and regenerate</button></div>
      </form>
    </section>`;
}

function themeSettingsForm(theme: PublicThemeSettings, notice = "") {
  const colorInput = (name: keyof PublicThemeSettings, label: string) => `
    <label class="theme-color-control"><span>${label}</span><input type="color" name="${name}" value="${escapeHtml(String(theme[name]))}" /></label>`;
  const starterKits = publicThemeKits.map((kit) => `<article class="theme-kit-card ${theme.kitId === kit.id ? "theme-kit-card--active" : ""}" style="--kit-paper:${kit.swatches[0]};--kit-ink:${kit.swatches[1]};--kit-accent:${kit.swatches[2]};">
    <div class="theme-kit-card__swatches" aria-hidden="true"><span></span><span></span><span></span></div>
    <p class="theme-kit-card__status">${theme.kitId === kit.id ? "Current kit" : kit.bestFor}</p><h3>${kit.name}</h3><p>${kit.description}</p>
    <form method="post" action="${config.controlPanelPath}/settings/theme/starter"><input type="hidden" name="kitId" value="${kit.id}" /><button class="button ${theme.kitId === kit.id ? "" : "button-primary"}" type="submit" ${theme.kitId === kit.id ? "disabled" : ""}>${theme.kitId === kit.id ? "Applied" : "Apply starter kit"}</button></form>
  </article>`).join("");
  return `${notice}
    <section class="editor-section"><p class="editor-section-kicker">Starter library</p><h2 class="editor-section-title">Theme starter kits</h2><p class="meta">Apply a complete visual direction, then fine-tune individual settings below. Existing Google Fonts URLs are preserved.</p><div class="theme-kit-grid">${starterKits}</div></section>
    <form id="theme-settings-form" method="post" action="${config.controlPanelPath}/settings/theme" class="theme-workbench">
      <input type="hidden" name="kitId" value="${theme.kitId}" />
      <div class="theme-controls form-grid">
        <section class="editor-section"><p class="editor-section-kicker">Public appearance</p><h2 class="editor-section-title">Theme settings</h2><p class="meta">Define shared design tokens for every generated post, fixed page, list, and form. Saving regenerates public output.</p></section>
        <section class="editor-section"><p class="editor-section-kicker">Palette</p><h2 class="editor-section-title">Colors</h2><div class="theme-color-grid">
          ${colorInput("backgroundColor", "Page background")}${colorInput("surfaceColor", "Surface")}${colorInput("textColor", "Primary text")}${colorInput("mutedColor", "Muted text")}${colorInput("borderColor", "Borders")}${colorInput("accentColor", "Accent")}
        </div></section>
        <section class="editor-section">
          <p class="editor-section-kicker">Typography</p><h2 class="editor-section-title">Font families</h2>
          <div class="grid">
            <label>Body font<input name="bodyFont" maxlength="80" value="${escapeHtml(theme.bodyFont)}" required /></label>
            <label>Heading font<input name="headingFont" maxlength="80" value="${escapeHtml(theme.headingFont)}" required /></label>
            <label>Monospace font<input name="monoFont" maxlength="80" value="${escapeHtml(theme.monoFont)}" required /></label>
            <label>Body size (px)<input type="number" name="bodyFontSize" min="14" max="20" step="1" value="${theme.bodyFontSize}" required /></label>
            <label>Line height<input type="number" name="lineHeight" min="1.4" max="2.2" step="0.1" value="${theme.lineHeight}" required /></label>
          </div>
          <label>Google Fonts CSS URLs<textarea name="googleFontsCssUrls" rows="5" placeholder="https://fonts.googleapis.com/css2?family=...">${escapeHtml(theme.googleFontsCssUrls.join("\n"))}</textarea><span class="meta">Use one URL per line or separate URLs with a pipe. Commas inside Google Fonts axis definitions remain unchanged. Leave empty to disable remote fonts.</span></label>
        </section>
        <section class="editor-section">
          <p class="editor-section-kicker">Layout rhythm</p><h2 class="editor-section-title">Width and spacing</h2>
          <div class="grid">
            <label>Content width (px)<input type="number" name="contentWidth" min="560" max="1200" step="10" value="${theme.contentWidth}" required /></label>
            <label>Spacing unit (px)<input type="number" name="spacingUnit" min="4" max="16" step="1" value="${theme.spacingUnit}" required /></label>
            <label>Corner radius (px)<input type="number" name="cornerRadius" min="0" max="24" step="1" value="${theme.cornerRadius}" required /></label>
          </div>
        </section>
        <div class="theme-actions"><button class="button button-primary" type="submit" name="intent" value="save">Save theme and regenerate</button><button class="button" type="submit" name="intent" value="reset" formnovalidate>Restore defaults</button></div>
      </div>
      <aside class="theme-preview" aria-label="Theme preview"><p class="theme-preview__label">Live preview</p><div class="theme-preview__page">
        <p class="theme-preview__kicker">Hybrid-Static-CMS</p><h2>Preview headline</h2><p>This preview shows the shared colors, typography, width, spacing, and corners before public pages are regenerated.</p><blockquote>Readable structure should remain clear in every language.</blockquote><code>const theme = "portable";</code><a href="#theme-settings-form">Example link</a>
      </div></aside>
    </form>
    <script>
      (() => {
        const form = document.getElementById("theme-settings-form");
        const preview = form?.querySelector(".theme-preview__page");
        if (!form || !preview) return;
        const value = (name) => form.elements.namedItem(name)?.value || "";
        const update = () => {
          preview.style.setProperty("--preview-bg", value("backgroundColor")); preview.style.setProperty("--preview-surface", value("surfaceColor"));
          preview.style.setProperty("--preview-ink", value("textColor")); preview.style.setProperty("--preview-muted", value("mutedColor"));
          preview.style.setProperty("--preview-line", value("borderColor")); preview.style.setProperty("--preview-accent", value("accentColor"));
          preview.style.setProperty("--preview-body-font", JSON.stringify(value("bodyFont")) + ", sans-serif"); preview.style.setProperty("--preview-heading-font", JSON.stringify(value("headingFont")) + ", serif");
          preview.style.setProperty("--preview-mono-font", JSON.stringify(value("monoFont")) + ", monospace"); preview.style.setProperty("--preview-size", value("bodyFontSize") + "px");
          preview.style.setProperty("--preview-leading", value("lineHeight")); preview.style.setProperty("--preview-space", value("spacingUnit") + "px"); preview.style.setProperty("--preview-radius", value("cornerRadius") + "px");
        };
        form.addEventListener("input", update); update();
      })();
    </script>`;
}

function localFontsPage(theme: PublicThemeSettings, files: LocalFontFile[], notice = "") {
  const activeFiles = new Set(theme.localFontFaces.map((face) => face.file));
  const modes = [
    ["remote", "Remote and local", "Allow configured Google Fonts requests and registered local files."],
    ["local", "Local only", "Block Google Fonts imports and serve registered files from this site."],
    ["system", "System only", "Generate no remote imports or local font-face rules."],
  ].map(([value, title, description]) => `<label class="font-mode-option"><input type="radio" name="fontDeliveryMode" value="${value}" ${theme.fontDeliveryMode === value ? "checked" : ""} /><span><strong>${title}</strong><small>${description}</small></span></label>`).join("");
  const rows = files.map((file, index) => {
    const face = theme.localFontFaces.find((item) => item.file === file.name);
    const safeName = escapeHtml(file.name);
    return `<tr><td><input type="hidden" name="fontFile" value="${safeName}" /><code>${safeName}</code><span class="meta">${escapeHtml(file.format.toUpperCase())} · ${formatByteSize(file.sizeBytes)}</span></td><td><label class="checkbox-label"><input type="checkbox" name="fontEnabled" value="${safeName}" ${face ? "checked" : ""} /><span>Register font face</span></label></td><td><input name="fontFamily:${safeName}" value="${escapeHtml(face?.family ?? "")}" placeholder="Example Sans" /></td><td><input name="fontWeight:${safeName}" value="${escapeHtml(face?.weight ?? "400")}" placeholder="400 or 100 900" /></td><td><select name="fontStyle:${safeName}"><option value="normal" ${face?.style !== "italic" ? "selected" : ""}>Normal</option><option value="italic" ${face?.style === "italic" ? "selected" : ""}>Italic</option></select></td><td class="cell-actions"><button class="button" form="delete-font-${index}" type="submit" ${activeFiles.has(file.name) ? "disabled title=\"Remove this font face before deleting the file.\"" : ""}>Delete</button></td></tr>`;
  }).join("");
  const deleteForms = files.map((file, index) => `<form id="delete-font-${index}" method="post" action="${config.controlPanelPath}/settings/fonts/delete"><input type="hidden" name="file" value="${escapeHtml(file.name)}" /></form>`).join("");
  return `<div class="content-list-page local-font-page">${notice}
    <section class="editor-section"><p class="editor-section-kicker">Privacy-first typography</p><h2 class="editor-section-title">Local fonts</h2><p class="meta">Host licensed font files from /assets/fonts and control whether generated CSS may contact Google Fonts.</p></section>
    <section class="editor-section"><p class="editor-section-kicker">Font library</p><h2 class="editor-section-title">Upload a font file</h2><form method="post" action="${config.controlPanelPath}/settings/fonts/upload" enctype="multipart/form-data" class="font-upload-row"><label>Font file<input type="file" name="font" accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf" required /></label><button class="button button-primary" type="submit">Upload font</button></form><p class="meta">Allowed: WOFF2, WOFF, TTF, OTF. Maximum 10 MB. Confirm that the font license permits web hosting.</p></section>
    <form method="post" action="${config.controlPanelPath}/settings/fonts" class="form-grid">
      <section class="editor-section"><p class="editor-section-kicker">Delivery policy</p><h2 class="editor-section-title">Font delivery mode</h2><div class="font-mode-grid">${modes}</div></section>
      <section class="editor-section"><div class="section-heading-row"><div><p class="editor-section-kicker">Registration</p><h2 class="editor-section-title">Local font faces</h2></div><span class="meta">${files.length} <span>files</span></span></div><p class="meta">Enable a file and use the same family name in Theme settings. Variable fonts can use a range such as 100 900.</p><table><thead><tr><th>File</th><th>Use</th><th>Family</th><th>Weight</th><th>Style</th><th>Action</th></tr></thead><tbody>${rows || `<tr><td colspan="6">No local font files yet.</td></tr>`}</tbody></table></section>
      <div class="row"><button class="button button-primary" type="submit">Save font settings and regenerate</button><a class="button" href="${config.controlPanelPath}/settings/theme">Theme settings</a></div>
    </form>${deleteForms}
  </div>`;
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
      <fieldset style="border:1px solid var(--line); border-radius:10px; padding:16px;"><legend>Roles</legend><div class="form-grid">${roleOptions}</div></fieldset>
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
    slug: String(form.get("slug") ?? ""),
    excerpt: String(form.get("excerpt") ?? ""),
    bodyMd: String(form.get("bodyMd") ?? ""),
    bodyHtml: String(form.get("bodyHtml") ?? ""),
    status: String(form.get("status") ?? "draft"),
    publishedAt: String(form.get("publishedAt") ?? ""),
    categories: String(form.get("categories") ?? ""),
    tags: String(form.get("tags") ?? ""),
    seriesId: String(form.get("seriesId") ?? ""),
    locale: String(form.get("locale") ?? "en"),
    translationGroup: String(form.get("translationGroup") ?? ""),
    seoTitle: String(form.get("seoTitle") ?? ""),
    seoDescription: String(form.get("seoDescription") ?? ""),
    seoCanonicalUrl: String(form.get("seoCanonicalUrl") ?? ""),
    seoOgImage: String(form.get("seoOgImage") ?? ""),
    seoKeywords: String(form.get("seoKeywords") ?? ""),
    seoNoindex: form.has("seoNoindex") ? "true" : "false",
    seoNofollow: form.has("seoNofollow") ? "true" : "false",
    autosaveKey: String(form.get("autosaveKey") ?? ""),
    autosaveBaseUpdatedAt: String(form.get("autosaveBaseUpdatedAt") ?? ""),
  };
}

function pageValuesFromForm(form: FormData) {
  return {
    title: String(form.get("title") ?? ""),
    slug: String(form.get("slug") ?? ""),
    excerpt: String(form.get("excerpt") ?? ""),
    bodyMd: String(form.get("bodyMd") ?? ""),
    bodyHtml: String(form.get("bodyHtml") ?? ""),
    status: String(form.get("status") ?? "draft"),
    publishedAt: String(form.get("publishedAt") ?? ""),
    pageGroupId: String(form.get("pageGroupId") ?? ""),
    stylesheetPath: String(form.get("stylesheetPath") ?? ""),
    locale: String(form.get("locale") ?? "en"),
    translationGroup: String(form.get("translationGroup") ?? ""),
    seoTitle: String(form.get("seoTitle") ?? ""),
    seoDescription: String(form.get("seoDescription") ?? ""),
    seoCanonicalUrl: String(form.get("seoCanonicalUrl") ?? ""),
    seoOgImage: String(form.get("seoOgImage") ?? ""),
    seoKeywords: String(form.get("seoKeywords") ?? ""),
    seoNoindex: form.has("seoNoindex") ? "true" : "false",
    seoNofollow: form.has("seoNofollow") ? "true" : "false",
    autosaveKey: String(form.get("autosaveKey") ?? ""),
    autosaveBaseUpdatedAt: String(form.get("autosaveBaseUpdatedAt") ?? ""),
  };
}

function applyPublishAndGenerateAction(form: FormData, values: { status: string; publishedAt: string }) {
  const publishAndGenerate = form.get("submitAction") === "publish_generate";
  if (publishAndGenerate) {
    values.status = "published";
    values.publishedAt = new Date().toISOString();
  }
  return publishAndGenerate;
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
    <div class="rich-editor-toolbar" data-rich-editor data-target="textarea[name=bodyHtml]">
      <div class="rich-editor-toolbar-heading">
        <p class="rich-editor-toolbar-title" data-i18n="HTML formatting tools">HTML formatting tools</p>
        <p class="meta" data-i18n="Select text in the HTML field, then choose a formatting action.">Select text in the HTML field, then choose a formatting action.</p>
      </div>
      <div class="rich-editor-groups">
        <fieldset class="rich-editor-group">
          <legend data-i18n="Text formatting">Text formatting</legend>
          <div class="rich-editor-actions">
            <button class="button" type="button" data-prefix="<strong>" data-suffix="</strong>" title="Bold" aria-label="Bold"><strong>B</strong></button>
            <button class="button" type="button" data-prefix="<em>" data-suffix="</em>" title="Italic" aria-label="Italic"><em>I</em></button>
            <button class="button" type="button" data-prefix="<u>" data-suffix="</u>" title="Underline" aria-label="Underline" data-i18n="Underline"><u>U</u></button>
            <button class="button" type="button" data-prefix="<s>" data-suffix="</s>" title="Strikethrough" aria-label="Strikethrough"><s>S</s></button>
            <button class="button" type="button" data-prefix="<mark>" data-suffix="</mark>" title="Highlight" aria-label="Highlight" data-i18n="Highlight">⬛HL</button>
            <button class="button" type="button" data-prefix="<sub>" data-suffix="</sub>" title="Subscript" aria-label="Subscript" data-i18n="Subscript">X₂</button>
            <button class="button" type="button" data-prefix="<sup>" data-suffix="</sup>" title="Superscript" aria-label="Superscript" data-i18n="Superscript">X²</button>
            <button class="button" type="button" data-ruby data-i18n="Ruby">Ruby</button>
          </div>
          <p class="rich-editor-group-label" data-i18n="Text size">Text size</p>
          <div class="rich-editor-actions">
            <button class="button" type="button" data-font-size="small" data-i18n="A-">A-</button>
            <button class="button" type="button" data-font-size="normal">A</button>
            <button class="button" type="button" data-font-size="large" data-i18n="A+">A+</button>
            <button class="button" type="button" data-font-size="xlarge" data-i18n="A++">A++</button>
          </div>
          <p class="rich-editor-group-label" data-i18n="Text color">Text color</p>
          <div class="rich-editor-color-row">
            <button type="button" class="rich-editor-color-swatch" data-text-color="#e0544e" style="background:#e0544e;" title="Red" aria-label="Red"></button>
            <button type="button" class="rich-editor-color-swatch" data-text-color="#e67e22" style="background:#e67e22;" title="Orange" aria-label="Orange"></button>
            <button type="button" class="rich-editor-color-swatch" data-text-color="#f1c40f" style="background:#f1c40f;" title="Yellow" aria-label="Yellow"></button>
            <button type="button" class="rich-editor-color-swatch" data-text-color="#27ae60" style="background:#27ae60;" title="Green" aria-label="Green"></button>
            <button type="button" class="rich-editor-color-swatch" data-text-color="#2980b9" style="background:#2980b9;" title="Blue" aria-label="Blue"></button>
            <button type="button" class="rich-editor-color-swatch" data-text-color="#8e44ad" style="background:#8e44ad;" title="Purple" aria-label="Purple"></button>
            <button type="button" class="rich-editor-color-swatch" data-text-color="#1abc9c" style="background:#1abc9c;" title="Teal" aria-label="Teal"></button>
            <button type="button" class="rich-editor-color-swatch" data-text-color="#333333" style="background:#333333;" title="Dark" aria-label="Dark"></button>
            <span class="rich-editor-color-picker-wrap"><input type="color" value="#41C9B4" data-text-color-picker title="Custom color" aria-label="Custom color" /><button type="button" class="button" data-apply-custom-color data-i18n="Apply">Apply</button></span>
          </div>
        </fieldset>

        <fieldset class="rich-editor-group">
          <legend data-i18n="Headings and structure">Headings and structure</legend>
          <div class="rich-editor-actions">
            <button class="button" type="button" data-prefix="<h1>" data-suffix="</h1>">H1</button>
            <button class="button" type="button" data-prefix="<h2>" data-suffix="</h2>">H2</button>
            <button class="button" type="button" data-prefix="<h3>" data-suffix="</h3>">H3</button>
            <button class="button" type="button" data-prefix="<h4>" data-suffix="</h4>">H4</button>
            <button class="button" type="button" data-prefix="<h5>" data-suffix="</h5>">H5</button>
            <button class="button" type="button" data-prefix="<h6>" data-suffix="</h6>">H6</button>
          </div>
          <p class="rich-editor-group-label" data-i18n="Structure">Structure</p>
          <div class="rich-editor-actions">
            <button class="button" type="button" data-prefix="<p>" data-suffix="</p>" data-i18n="Paragraph">Paragraph</button>
            <button class="button" type="button" data-prefix="<blockquote>" data-suffix="</blockquote>" data-i18n="Quote">Quote</button>
            <button class="button" type="button" data-prefix="<hr />" data-suffix="" data-i18n="Rule">Rule</button>
            <button class="button" type="button" data-insert-details data-i18n="Accordion">Accordion</button>
          </div>
        </fieldset>

        <fieldset class="rich-editor-group">
          <legend data-i18n="Lists and alignment">Lists and alignment</legend>
          <div class="rich-editor-actions">
            <button class="button" type="button" data-prefix="<ul>\\n  <li>" data-suffix="</li>\\n</ul>" data-i18n="Bullets">Bullets</button>
            <button class="button" type="button" data-prefix="<ol>\\n  <li>" data-suffix="</li>\\n</ol>" data-i18n="Numbered">Numbered</button>
            <button class="button" type="button" data-insert-checklist data-i18n="Checklist">Checklist</button>
            <button class="button" type="button" data-insert-deflist data-i18n="Definition list">Def list</button>
          </div>
          <p class="rich-editor-group-label" data-i18n="Alignment">Alignment</p>
          <div class="rich-editor-actions">
            <button class="button" type="button" data-align="left" data-i18n="Left">Left</button>
            <button class="button" type="button" data-align="center" data-i18n="Center">Center</button>
            <button class="button" type="button" data-align="right" data-i18n="Right">Right</button>
            <button class="button" type="button" data-align="justify" data-i18n="Justify">Justify</button>
          </div>
        </fieldset>

        <fieldset class="rich-editor-group">
          <legend data-i18n="Code and notation">Code and notation</legend>
          <div class="rich-editor-actions">
            <button class="button" type="button" data-prefix="<code>" data-suffix="</code>" data-i18n="Inline code">Inline</button>
            <button class="button" type="button" data-prefix="<pre><code>" data-suffix="</code></pre>" data-i18n="Code">Code</button>
            <button class="button" type="button" data-insert-table data-i18n="Table">Table</button>
          </div>
          <p class="rich-editor-group-label" data-i18n="Math and diagrams">Math & diagrams</p>
          <div class="rich-editor-actions">
            <button class="button" type="button" data-prefix="\\\\(" data-suffix="\\\\)" data-i18n="Math">Math</button>
            <button class="button" type="button" data-prefix="\\\\[\\n" data-suffix="\\n\\\\]" data-i18n="Math block">Math block</button>
            <button class="button" type="button" data-prefix="<pre><code class=&quot;language-mermaid&quot;>graph TD\\n  A[Start] --> B[End]" data-suffix="</code></pre>" data-i18n="Mermaid">Mermaid</button>
          </div>
        </fieldset>

        <fieldset class="rich-editor-group rich-editor-group-wide">
          <legend data-i18n="Links and files">Links & embeds</legend>
          <div class="rich-editor-upload-row">
            <div class="rich-editor-actions">
              <button class="button" type="button" data-link data-i18n="Link">Link</button>
              <button class="button" type="button" data-insert-image data-i18n="Image">Image</button>
              <button class="button" type="button" data-insert-video data-i18n="Video">Video</button>
              <button class="button" type="button" data-insert-iframe data-i18n="Embed iframe">Embed</button>
              <button class="button" type="button" data-insert-footnote data-i18n="Footnote">Footnote</button>
              <button class="button" type="button" data-insert-map data-i18n="Map shortcode">Map</button>
              ${uploadUrl ? `<label class="button rich-editor-upload-button" data-i18n="Upload file">Upload file <input type="file" data-editor-upload accept="image/*,video/*,audio/*,application/pdf,text/plain" /></label>` : ""}
            </div>
            ${uploadUrl ? `<span class="meta" data-upload-status data-i18n="Images, video, audio, PDF, and text files">Images, video, audio, PDF, and text files</span>` : ""}
          </div>
        </fieldset>
      </div>
    </div>
    <script>
      const adminText = (source) => window.adminTranslate?.(source) || source;
      document.querySelectorAll("[data-rich-editor]").forEach((toolbar) => {
        const target = document.querySelector(toolbar.dataset.target);
        if (!target) return;
        /* --- Prefix/Suffix wrap buttons --- */
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
        /* --- Alignment buttons --- */
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
        /* --- Font size buttons --- */
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
        /* --- Text color swatches --- */
        toolbar.querySelectorAll("[data-text-color]").forEach((button) => {
          button.addEventListener("click", () => {
            const color = button.dataset.textColor;
            const start = target.selectionStart ?? target.value.length;
            const end = target.selectionEnd ?? start;
            const selected = target.value.slice(start, end) || "text";
            const replacement = '<span style="color:' + color + '">' + selected + '</span>';
            target.value = target.value.slice(0, start) + replacement + target.value.slice(end);
            target.focus();
            target.selectionStart = start;
            target.selectionEnd = start + replacement.length;
          });
        });
        /* --- Custom color picker + Apply --- */
        toolbar.querySelector("[data-apply-custom-color]")?.addEventListener("click", () => {
          const picker = toolbar.querySelector("[data-text-color-picker]");
          if (!picker) return;
          const color = picker.value;
          const start = target.selectionStart ?? target.value.length;
          const end = target.selectionEnd ?? start;
          const selected = target.value.slice(start, end) || "text";
          const replacement = '<span style="color:' + color + '">' + selected + '</span>';
          target.value = target.value.slice(0, start) + replacement + target.value.slice(end);
          target.focus();
          target.selectionStart = start;
          target.selectionEnd = start + replacement.length;
        });
        /* --- Ruby --- */
        toolbar.querySelector("button[data-ruby]")?.addEventListener("click", () => {
          const start = target.selectionStart ?? target.value.length;
          const end = target.selectionEnd ?? start;
          const selected = target.value.slice(start, end) || "漢字";
          const reading = window.prompt(adminText("Reading"), "かんじ");
          if (!reading) return;
          const safeReading = reading.replace(/[<>]/g, "");
          const replacement = '<ruby>' + selected + '<rp>(</rp><rt>' + safeReading + '</rt><rp>)</rp></ruby>';
          target.value = target.value.slice(0, start) + replacement + target.value.slice(end);
          target.focus();
          target.selectionStart = start;
          target.selectionEnd = start + replacement.length;
        });
        /* --- Link --- */
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
        /* --- Image embed --- */
        toolbar.querySelector("button[data-insert-image]")?.addEventListener("click", () => {
          const url = window.prompt(adminText("Image URL"), "https://");
          if (!url) return;
          const alt = window.prompt(adminText("Alt text"), "") || "";
          const start = target.selectionStart ?? target.value.length;
          const snippet = '<img src="' + url.replaceAll('"', '') + '" alt="' + alt.replaceAll('"', '') + '" />';
          target.value = target.value.slice(0, start) + snippet + target.value.slice(start);
          target.focus();
          target.selectionStart = target.selectionEnd = start + snippet.length;
        });
        /* --- Video embed --- */
        toolbar.querySelector("button[data-insert-video]")?.addEventListener("click", () => {
          const url = window.prompt(adminText("Video URL"), "https://");
          if (!url) return;
          const start = target.selectionStart ?? target.value.length;
          const snippet = '<video controls src="' + url.replaceAll('"', '') + '"></video>';
          target.value = target.value.slice(0, start) + snippet + target.value.slice(start);
          target.focus();
          target.selectionStart = target.selectionEnd = start + snippet.length;
        });
        /* --- iframe embed --- */
        toolbar.querySelector("button[data-insert-iframe]")?.addEventListener("click", () => {
          const url = window.prompt(adminText("Embed URL (YouTube, etc.)"), "https://www.youtube.com/embed/");
          if (!url) return;
          const start = target.selectionStart ?? target.value.length;
          const snippet = '<iframe src="' + url.replaceAll('"', '') + '" width="560" height="315" frameborder="0" allowfullscreen loading="lazy"></iframe>';
          target.value = target.value.slice(0, start) + snippet + target.value.slice(start);
          target.focus();
          target.selectionStart = target.selectionEnd = start + snippet.length;
        });
        /* --- Footnote --- */
        toolbar.querySelector("button[data-insert-footnote]")?.addEventListener("click", () => {
          const id = window.prompt(adminText("Footnote ID (number or label)"), "1");
          if (!id) return;
          const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "");
          const start = target.selectionStart ?? target.value.length;
          const end = target.selectionEnd ?? start;
          const selected = target.value.slice(start, end);
          const refSnippet = '<sup><a href="#fn-' + safeId + '" id="fnref-' + safeId + '">[' + safeId + ']</a></sup>';
          const noteSnippet = '\\n<p id="fn-' + safeId + '"><small>[' + safeId + '] ' + (selected || adminText("Footnote text")) + ' <a href="#fnref-' + safeId + '">↩</a></small></p>';
          target.value = target.value.slice(0, start) + refSnippet + target.value.slice(end) + noteSnippet;
          target.focus();
          target.selectionStart = target.selectionEnd = start + refSnippet.length;
        });
        /* --- Managed map shortcode --- */
        toolbar.querySelector("button[data-insert-map]")?.addEventListener("click", () => {
          const slug = window.prompt(adminText("Map slug"), "map-slug");
          if (!slug) return;
          const safeSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
          if (!safeSlug) return;
          const start = target.selectionStart ?? target.value.length;
          const snippet = "[[map:" + safeSlug + "]]";
          target.value = target.value.slice(0, start) + snippet + target.value.slice(start);
          target.focus();
          target.selectionStart = target.selectionEnd = start + snippet.length;
        });
        /* --- Accordion / Details --- */
        toolbar.querySelector("button[data-insert-details]")?.addEventListener("click", () => {
          const summary = window.prompt(adminText("Summary text"), adminText("Click to expand"));
          if (!summary) return;
          const start = target.selectionStart ?? target.value.length;
          const end = target.selectionEnd ?? start;
          const selected = target.value.slice(start, end) || adminText("Content here...");
          const replacement = '<details>\\n  <summary>' + summary.replace(/[<>]/g, '') + '</summary>\\n  <p>' + selected + '</p>\\n</details>';
          target.value = target.value.slice(0, start) + replacement + target.value.slice(end);
          target.focus();
          target.selectionStart = start;
          target.selectionEnd = start + replacement.length;
        });
        /* --- Checklist --- */
        toolbar.querySelector("button[data-insert-checklist]")?.addEventListener("click", () => {
          const start = target.selectionStart ?? target.value.length;
          const end = target.selectionEnd ?? start;
          const selected = target.value.slice(start, end) || adminText("Item");
          const snippet = '<ul class="checklist">\\n  <li><input type="checkbox" disabled /> ' + selected + '</li>\\n  <li><input type="checkbox" disabled /> </li>\\n</ul>';
          target.value = target.value.slice(0, start) + snippet + target.value.slice(end);
          target.focus();
          target.selectionStart = start;
          target.selectionEnd = start + snippet.length;
        });
        /* --- Definition list --- */
        toolbar.querySelector("button[data-insert-deflist]")?.addEventListener("click", () => {
          const start = target.selectionStart ?? target.value.length;
          const end = target.selectionEnd ?? start;
          const selected = target.value.slice(start, end) || adminText("Term");
          const snippet = '<dl>\\n  <dt>' + selected + '</dt>\\n  <dd>' + adminText("Definition") + '</dd>\\n</dl>';
          target.value = target.value.slice(0, start) + snippet + target.value.slice(end);
          target.focus();
          target.selectionStart = start;
          target.selectionEnd = start + snippet.length;
        });
        /* --- Table --- */
        toolbar.querySelector("button[data-insert-table]")?.addEventListener("click", () => {
          const start = target.selectionStart ?? target.value.length;
          const snippet = '<table>\\n  <thead>\\n    <tr>\\n      <th>' + adminText("Header") + ' 1</th>\\n      <th>' + adminText("Header") + ' 2</th>\\n      <th>' + adminText("Header") + ' 3</th>\\n    </tr>\\n  </thead>\\n  <tbody>\\n    <tr>\\n      <td></td>\\n      <td></td>\\n      <td></td>\\n    </tr>\\n    <tr>\\n      <td></td>\\n      <td></td>\\n      <td></td>\\n    </tr>\\n  </tbody>\\n</table>';
          target.value = target.value.slice(0, start) + snippet + target.value.slice(start);
          target.focus();
          target.selectionStart = target.selectionEnd = start + snippet.length;
        });
        /* --- File upload --- */
        toolbar.querySelector("[data-editor-upload]")?.addEventListener("change", async (event) => {
          const input = event.currentTarget;
          const file = input.files?.[0];
          if (!file) return;
          const status = toolbar.querySelector("[data-upload-status]");
          if (status) status.textContent = adminText("Uploading...");
          const data = new FormData();
          data.append("file", file);
          data.append("altText", file.name);
          try {
            const response = await fetch("${escapeHtml(uploadUrl ?? "")}", { method: "POST", body: data, credentials: "same-origin" });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || adminText("Upload failed."));
            const start = target.selectionStart ?? target.value.length;
            const snippet = payload.snippet || payload.url;
            target.value = target.value.slice(0, start) + snippet + target.value.slice(start);
            target.focus();
            target.selectionStart = target.selectionEnd = start + snippet.length;
            if (status) status.textContent = adminText("Uploaded and inserted") + ": " + payload.name;
          } catch (error) {
            if (status) status.textContent = error.message || adminText("Upload failed.");
          } finally {
            input.value = "";
          }
        });
      });
    </script>
  `;
}

function seriesSelect(series: Awaited<ReturnType<typeof listSeries>>, selectedId?: string) {
  return `<label>Series <select name="seriesId" data-slug-scope="series"><option value="">No series</option>${series.map((item) => `<option value="${item.id}" data-scope-slug="${escapeHtml(item.slug)}" ${selectedId === String(item.id) ? "selected" : ""}>${escapeHtml(item.title)} (${escapeHtml(item.slug)})</option>`).join("")}</select><span class="meta">Group this article under one series. Manage series in the Series menu.</span></label>`;
}

function slugAutomationScript() {
  return `<script>
    (() => {
      const form = document.currentScript?.previousElementSibling;
      if (!form) return;
      const title = form.querySelector('input[name="title"]');
      const slug = form.querySelector('input[name="slug"]');
      const scope = form.querySelector('select[data-slug-scope]');
      if (!title || !slug || !scope) return;
      let generated = !slug.value;
      const normalize = (value) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      const update = () => {
        if (!generated) return;
        const parent = scope.selectedOptions[0]?.dataset.scopeSlug || "";
        const child = normalize(title.value);
        slug.value = parent && child ? parent + "-" + child : child;
      };
      title.addEventListener("input", update);
      scope.addEventListener("change", update);
      slug.addEventListener("input", () => { generated = false; });
      update();
    })();
  </script>`;
}

function pageGroupSelect(groups: Awaited<ReturnType<typeof listPageGroups>>, selectedId?: string) {
  return `<label>Page group <select name="pageGroupId" data-slug-scope="pageGroup"><option value="">No page group</option>${groups.map((item) => `<option value="${item.id}" data-scope-slug="${escapeHtml(item.slug)}" ${selectedId === String(item.id) ? "selected" : ""}>${escapeHtml(item.title)} (${escapeHtml(item.slug)})</option>`).join("")}</select><span class="meta">Group this fixed page under one page group. Manage groups in the Page groups menu.</span></label>`;
}

function stylesheetSelect(
  name: string,
  stylesheets: string[],
  selectedPath: string | undefined,
  emptyLabel: string,
  description: string,
) {
  return `<label>Stylesheet
    <select name="${escapeHtml(name)}">
      <option value="">${escapeHtml(emptyLabel)}</option>
      ${stylesheets.map((stylesheet) => `<option value="${escapeHtml(stylesheet)}" ${selectedPath === stylesheet ? "selected" : ""}>${escapeHtml(stylesheet)}</option>`).join("")}
    </select>
    <span class="meta">${escapeHtml(description)}</span>
  </label>`;
}

function newAutosaveKey(value?: string) {
  return value && /^[A-Za-z0-9_-]{1,96}$/.test(value) ? value : `new-${crypto.randomUUID()}`;
}

function editorAutosaveUi(contentType: AutosaveContentType, key: string, baseUpdatedAt = "") {
  const endpoint = `${config.controlPanelPath}/${contentType}s/autosave/${encodeURIComponent(key)}`;
  const baseDate = baseUpdatedAt ? new Date(baseUpdatedAt) : null;
  const normalizedBaseUpdatedAt = baseDate && !Number.isNaN(baseDate.getTime()) ? baseDate.toISOString() : "";
  return `
    <input type="hidden" name="autosaveKey" value="${escapeHtml(key)}" />
    <input type="hidden" name="autosaveBaseUpdatedAt" value="${escapeHtml(normalizedBaseUpdatedAt)}" />
    <aside class="editor-autosave" data-editor-autosave data-endpoint="${escapeHtml(endpoint)}" data-base-updated-at="${escapeHtml(normalizedBaseUpdatedAt)}">
      <div class="editor-autosave-status"><span class="editor-autosave-dot" aria-hidden="true"></span><span data-autosave-status>Autosave ready</span></div>
      <div class="editor-autosave-recovery" data-autosave-recovery hidden>
        <div>
          <strong>Unsaved changes were found.</strong>
          <p class="meta" data-autosave-message>Restore the automatically saved version or discard it.</p>
          <p class="meta security-warning" data-autosave-conflict hidden>The saved post or page changed after this recovery copy was created. Review restored values before saving.</p>
        </div>
        <div class="row">
          <button class="button button-primary" type="button" data-autosave-restore>Restore autosave</button>
          <button class="button" type="button" data-autosave-discard>Discard autosave</button>
        </div>
      </div>
    </aside>
  `;
}

function editorAutosaveScript() {
  return `<script>
    (() => {
      const form = document.querySelector("form[data-autosave-form]");
      const panel = form?.querySelector("[data-editor-autosave]");
      if (!form || !panel) return;
      const endpoint = panel.dataset.endpoint;
      const baseUpdatedAt = panel.dataset.baseUpdatedAt || null;
      const csrf = form.querySelector('input[name="_csrf"]')?.value || "";
      const status = panel.querySelector("[data-autosave-status]");
      const recovery = panel.querySelector("[data-autosave-recovery]");
      const conflict = panel.querySelector("[data-autosave-conflict]");
      let pendingPayload = null;
      let timer = null;
      let submitting = false;

      const text = (source) => window.adminTranslate?.(source) || source;
      const setStatus = (message, state = "") => {
        status.textContent = text(message);
        panel.dataset.state = state;
      };
      const collect = () => {
        const payload = {};
        form.querySelectorAll("input[name], textarea[name], select[name]").forEach((field) => {
          if (["_csrf", "autosaveKey", "autosaveBaseUpdatedAt"].includes(field.name) || field.type === "file" || field.type === "submit") return;
          payload[field.name] = field.type === "checkbox" ? field.checked : field.value;
        });
        return payload;
      };
      let lastSnapshot = JSON.stringify(collect());

      const save = async () => {
        if (submitting) return;
        const payload = collect();
        const snapshot = JSON.stringify(payload);
        if (snapshot === lastSnapshot) return;
        setStatus("Autosaving...", "saving");
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
            body: JSON.stringify({ payload, baseUpdatedAt }),
          });
          if (!response.ok) throw new Error("Autosave failed.");
          const result = await response.json();
          lastSnapshot = snapshot;
          setStatus("Autosaved", "saved");
          panel.title = result.updatedAt || "";
        } catch {
          setStatus("Autosave failed. Your form remains open.", "error");
        }
      };
      const schedule = () => {
        clearTimeout(timer);
        timer = setTimeout(save, 2000);
        setStatus("Unsaved changes", "dirty");
      };
      form.addEventListener("input", schedule);
      form.addEventListener("change", schedule);
      form.addEventListener("click", (event) => {
        if (event.target.closest('button[type="button"]') && !event.target.closest("[data-autosave-recovery]")) {
          setTimeout(schedule, 50);
        }
      });
      form.addEventListener("submit", () => {
        submitting = true;
        clearTimeout(timer);
        setStatus("Saving...", "saving");
      });
      window.addEventListener("pagehide", () => {
        if (submitting || JSON.stringify(collect()) === lastSnapshot) return;
        fetch(endpoint, {
          method: "POST",
          credentials: "same-origin",
          keepalive: true,
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
          body: JSON.stringify({ payload: collect(), baseUpdatedAt }),
        }).catch(() => undefined);
      });
      setInterval(() => {
        if (!submitting && JSON.stringify(collect()) !== lastSnapshot) schedule();
      }, 5000);

      panel.querySelector("[data-autosave-restore]")?.addEventListener("click", () => {
        if (!pendingPayload) return;
        Object.entries(pendingPayload).forEach(([name, value]) => {
          const field = form.elements.namedItem(name);
          if (!field || field instanceof RadioNodeList) return;
          if (field.type === "checkbox") field.checked = Boolean(value);
          else field.value = String(value);
        });
        recovery.hidden = true;
        lastSnapshot = JSON.stringify(collect());
        setStatus("Autosave restored. Review and save when ready.", "restored");
      });
      panel.querySelector("[data-autosave-discard]")?.addEventListener("click", async () => {
        const response = await fetch(endpoint + "/delete", {
          method: "POST",
          credentials: "same-origin",
          headers: { "X-CSRF-Token": csrf },
        });
        if (response.ok) {
          pendingPayload = null;
          recovery.hidden = true;
          setStatus("Autosave discarded", "");
        }
      });

      fetch(endpoint, { credentials: "same-origin" })
        .then((response) => response.ok ? response.json() : null)
        .then((result) => {
          if (!result?.autosave) return;
          pendingPayload = result.autosave.payload;
          recovery.hidden = false;
          conflict.hidden = !(result.autosave.baseUpdatedAt && baseUpdatedAt && result.autosave.baseUpdatedAt !== baseUpdatedAt);
          setStatus("Recovery copy available", "recovery");
        })
        .catch(() => setStatus("Autosave unavailable", "error"));

      const url = new URL(window.location.href);
      if (url.pathname.endsWith("/new") && !url.searchParams.has("autosave")) {
        url.searchParams.set("autosave", form.elements.autosaveKey.value);
        history.replaceState(null, "", url);
      }
    })();
  </script>`;
}

function postForm(action: string, values?: Record<string, string>, series: Awaited<ReturnType<typeof listSeries>> = []) {
  const autosaveKey = newAutosaveKey(values?.autosaveKey);
  return `
    <form method="post" action="${action}" class="form-grid editor-form" data-autosave-form>
      ${editorAutosaveUi("post", autosaveKey, values?.autosaveBaseUpdatedAt)}
      <section class="editor-section">
        <p class="editor-section-kicker">Content setup</p>
        <h2 class="editor-section-title">Basic information</h2>
        <label>Title <input name="title" value="${escapeHtml(values?.title ?? "")}" required /></label>
        <label>Slug <input name="slug" value="${escapeHtml(values?.slug ?? "")}" placeholder="auto-generated if empty" /></label>
        <label><span data-i18n="Content language">Content language</span> <select name="locale">${contentLocales.map((locale) => `<option value="${locale}" ${values?.locale === locale || (!values?.locale && locale === "en") ? "selected" : ""}>${localeLabels[locale]}</option>`).join("")}</select></label>
        <input type="hidden" name="translationGroup" value="${escapeHtml(values?.translationGroup ?? "")}" />
        ${seriesSelect(series, values?.seriesId)}
        <details class="editor-inline-details">
          <summary>Additional article information</summary>
          <div class="form-grid">
            <label>Excerpt <textarea name="excerpt">${escapeHtml(values?.excerpt ?? "")}</textarea></label>
            <label>Categories (comma-separated slugs) <input name="categories" value="${escapeHtml(values?.categories ?? "")}" /></label>
            <label>Tags (comma-separated slugs) <input name="tags" value="${escapeHtml(values?.tags ?? "")}" /></label>
          </div>
        </details>
      </section>
      <section class="editor-section">
        <p class="editor-section-kicker">Writing</p>
        <h2 class="editor-section-title">Article body</h2>
        <label>Body (Markdown-like) <textarea name="bodyMd">${escapeHtml(values?.bodyMd ?? "")}</textarea></label>
        <label>Body HTML editor <textarea name="bodyHtml" rows="16" placeholder="Write HTML here, or use the toolbar below.">${escapeHtml(values?.bodyHtml ?? "")}</textarea></label>
        ${richEditorTools(`${config.controlPanelPath}/posts/media/upload`)}
      </section>
      <details class="editor-section editor-section-compact editor-collapsible">
        <summary><span class="editor-section-kicker">Publishing</span><span class="editor-section-title">Publication settings</span></summary>
        <div class="form-grid">
        <label>Status
        <select name="status">
          <option value="draft" ${values?.status === "draft" ? "selected" : ""}>Draft</option>
          <option value="published" ${values?.status === "published" ? "selected" : ""}>Published</option>
          <option value="scheduled" ${values?.status === "scheduled" ? "selected" : ""}>Scheduled</option>
        </select>
        </label>
        <label>Published at <input type="datetime-local" name="publishedAt" value="${escapeHtml(values?.publishedAt ?? "")}" /><span class="meta"><span data-i18n="Schedule timezone">Schedule timezone</span>: <code>${escapeHtml(config.scheduleTimeZone)}</code></span></label>
        </div>
      </details>
      <details class="editor-section editor-section-compact editor-collapsible">
        <summary><span class="editor-section-kicker">Search visibility</span><span class="editor-section-title">SEO settings</span></summary>
        <div class="form-grid">
        <label>SEO title <input name="seoTitle" value="${escapeHtml(values?.seoTitle ?? "")}" /></label>
        <label>SEO description <textarea name="seoDescription">${escapeHtml(values?.seoDescription ?? "")}</textarea></label>
        <label>Canonical URL <input name="seoCanonicalUrl" value="${escapeHtml(values?.seoCanonicalUrl ?? "")}" placeholder="auto-generated if empty" /></label>
        <label>OG image URL <input name="seoOgImage" value="${escapeHtml(values?.seoOgImage ?? "")}" /></label>
        <label>SEO keywords <input name="seoKeywords" value="${escapeHtml(values?.seoKeywords ?? "")}" placeholder="comma-separated" /></label>
        <label class="checkbox-label"><input type="checkbox" name="seoNoindex" value="true" ${values?.seoNoindex === "true" ? "checked" : ""} /> <span>Prevent search indexing (noindex)</span></label>
        <label class="checkbox-label"><input type="checkbox" name="seoNofollow" value="true" ${values?.seoNofollow === "true" ? "checked" : ""} /> <span>Prevent link following (nofollow)</span></label>
        </div>
      </details>
      <p class="meta">Only published content has a generated public page. Drafts are saved without a public file, and scheduled content is generated when it is published.</p>
      <div class="row">
        <button class="button" type="submit" name="submitAction" value="save">Save post</button>
        <button class="button button-primary" type="submit" name="submitAction" value="publish_generate">Publish and generate page</button>
      </div>
    </form>
    ${slugAutomationScript()}
    ${editorAutosaveScript()}
  `;
}

function pageForm(
  action: string,
  values?: Record<string, string>,
  groups: Awaited<ReturnType<typeof listPageGroups>> = [],
  stylesheets: string[] = [],
) {
  const autosaveKey = newAutosaveKey(values?.autosaveKey);
  return `
    <form method="post" action="${action}" class="form-grid editor-form" data-autosave-form>
      ${editorAutosaveUi("page", autosaveKey, values?.autosaveBaseUpdatedAt)}
      <section class="editor-section">
        <p class="editor-section-kicker">Page setup</p>
        <h2 class="editor-section-title">Basic information</h2>
        <label>Title <input name="title" value="${escapeHtml(values?.title ?? "")}" required /></label>
        <label>Slug <input name="slug" value="${escapeHtml(values?.slug ?? "")}" placeholder="auto-generated if empty" /></label>
        <label><span data-i18n="Content language">Content language</span> <select name="locale">${contentLocales.map((locale) => `<option value="${locale}" ${values?.locale === locale || (!values?.locale && locale === "en") ? "selected" : ""}>${localeLabels[locale]}</option>`).join("")}</select></label>
        <input type="hidden" name="translationGroup" value="${escapeHtml(values?.translationGroup ?? "")}" />
        ${pageGroupSelect(groups, values?.pageGroupId)}
        <details class="editor-inline-details">
          <summary>Additional page information</summary>
          <label>Excerpt <textarea name="excerpt">${escapeHtml(values?.excerpt ?? "")}</textarea></label>
        </details>
      </section>
      <section class="editor-section">
        <p class="editor-section-kicker">Writing</p>
        <h2 class="editor-section-title">Page body</h2>
        <label>Body (Markdown-like) <textarea name="bodyMd">${escapeHtml(values?.bodyMd ?? "")}</textarea></label>
        <label>Body HTML override <textarea name="bodyHtml">${escapeHtml(values?.bodyHtml ?? "")}</textarea></label>
        ${richEditorTools()}
      </section>
      <details class="editor-section editor-section-compact editor-collapsible">
        <summary><span class="editor-section-kicker">Presentation</span><span class="editor-section-title">Appearance</span></summary>
        <div class="form-grid">
          ${stylesheetSelect("stylesheetPath", stylesheets, values?.stylesheetPath, "Default site stylesheet only", "Choose a CSS file from public_html/assets/css/pages.")}
        </div>
      </details>
      <details class="editor-section editor-section-compact editor-collapsible">
        <summary><span class="editor-section-kicker">Publishing</span><span class="editor-section-title">Publication settings</span></summary>
        <div class="form-grid">
        <label>Status
        <select name="status">
          <option value="draft" ${values?.status === "draft" ? "selected" : ""}>Draft</option>
          <option value="published" ${values?.status === "published" ? "selected" : ""}>Published</option>
          <option value="scheduled" ${values?.status === "scheduled" ? "selected" : ""}>Scheduled</option>
        </select>
        </label>
        <label>Published at <input type="datetime-local" name="publishedAt" value="${escapeHtml(values?.publishedAt ?? "")}" /><span class="meta"><span data-i18n="Schedule timezone">Schedule timezone</span>: <code>${escapeHtml(config.scheduleTimeZone)}</code></span></label>
        </div>
      </details>
      <details class="editor-section editor-section-compact editor-collapsible">
        <summary><span class="editor-section-kicker">Search visibility</span><span class="editor-section-title">SEO settings</span></summary>
        <div class="form-grid">
        <label>SEO title <input name="seoTitle" value="${escapeHtml(values?.seoTitle ?? "")}" /></label>
        <label>SEO description <textarea name="seoDescription">${escapeHtml(values?.seoDescription ?? "")}</textarea></label>
        <label>Canonical URL <input name="seoCanonicalUrl" value="${escapeHtml(values?.seoCanonicalUrl ?? "")}" placeholder="auto-generated if empty" /></label>
        <label>OG image URL <input name="seoOgImage" value="${escapeHtml(values?.seoOgImage ?? "")}" /></label>
        <label>SEO keywords <input name="seoKeywords" value="${escapeHtml(values?.seoKeywords ?? "")}" placeholder="comma-separated" /></label>
        <label class="checkbox-label"><input type="checkbox" name="seoNoindex" value="true" ${values?.seoNoindex === "true" ? "checked" : ""} /> <span>Prevent search indexing (noindex)</span></label>
        <label class="checkbox-label"><input type="checkbox" name="seoNofollow" value="true" ${values?.seoNofollow === "true" ? "checked" : ""} /> <span>Prevent link following (nofollow)</span></label>
        </div>
      </details>
      <p class="meta">Only published content has a generated public page. Drafts are saved without a public file, and scheduled content is generated when it is published.</p>
      <div class="row">
        <button class="button" type="submit" name="submitAction" value="save">Save page</button>
        <button class="button button-primary" type="submit" name="submitAction" value="publish_generate">Publish and generate page</button>
      </div>
    </form>
    ${slugAutomationScript()}
    ${editorAutosaveScript()}
  `;
}

function translationPanel(
  contentType: "posts" | "pages",
  content: PostRecord | PageRecord,
  translations: Array<PostRecord | PageRecord>,
) {
  const byLocale = new Map(translations.map((item) => [item.locale, item]));
  return `<section class="editor-section editor-section-compact">
    <p class="editor-section-kicker" data-i18n="Localization">Localization</p>
    <h2 class="editor-section-title" data-i18n="Translations">Translations</h2>
    <p class="meta" data-i18n="Translations share a content group but are independently drafted, reviewed, and published.">Translations share a content group but are independently drafted, reviewed, and published.</p>
    <div class="row">${contentLocales.map((locale) => {
      const item = byLocale.get(locale);
      return item
        ? `<a class="button ${item.id === content.id ? "button-primary" : ""}" href="${config.controlPanelPath}/${contentType}/${item.id}/edit">${localeLabels[locale]}</a>`
        : `<form method="post" action="${config.controlPanelPath}/${contentType}/${content.id}/translations"><input type="hidden" name="locale" value="${locale}" /><button class="button" type="submit">Create ${localeLabels[locale]}</button></form>`;
    }).join("")}</div>
  </section>`;
}

function formBuilderForm(action: string, values?: Record<string, string>) {
  const fields = (values?.fieldsSpec ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = "", label = "", type = "text", required = "false", options = ""] = line.split("|");
      return { name, label, type, required: required.toLowerCase() === "true", options };
    });
  return `
    <form method="post" action="${action}" class="editor-form form-grid">
      <section class="editor-section">
        <p class="editor-section-kicker">Form setup</p>
        <h2 class="editor-section-title">Basic information</h2>
        <div class="form-grid">
          <label>Title <input name="title" value="${escapeHtml(values?.title ?? "")}" required /></label>
          <label>Slug <input name="slug" value="${escapeHtml(values?.slug ?? "")}" placeholder="auto-generated if empty" /></label>
          <label>Description <textarea name="description">${escapeHtml(values?.description ?? "")}</textarea></label>
        </div>
      </section>
      <section class="editor-section structured-builder" data-structured-builder="form">
        <p class="editor-section-kicker">Form structure</p>
        <h2 class="editor-section-title">Fields</h2>
        <p class="meta">Add fields in the same order visitors should complete them.</p>
        <div class="structured-rows" data-structured-rows>
          ${(fields.length ? fields : [{ name: "", label: "", type: "text", required: false, options: "" }]).map((field) => formFieldEditorRow(field)).join("")}
        </div>
        <button class="button structured-add" type="button" data-add-structured-row>Add field</button>
        <label class="structured-source">Fields definition
          <textarea name="fieldsSpec">${escapeHtml(values?.fieldsSpec ?? "")}</textarea>
        </label>
        <p class="meta structured-source">One field per line: <code>name|Label|type|required|option1,option2</code>. Types: text, email, textarea, select, checkbox.</p>
      </section>
      <section class="editor-section">
        <p class="editor-section-kicker">Response</p>
        <h2 class="editor-section-title">Submission experience</h2>
        <div class="form-grid">
          <label>Submit button label <input name="submitLabel" value="${escapeHtml(values?.submitLabel ?? "Send")}" /></label>
          <label>Success message <textarea name="successMessage">${escapeHtml(values?.successMessage ?? "Thank you. Your submission has been received.")}</textarea></label>
        </div>
      </section>
      <details class="editor-section editor-section-compact editor-collapsible">
        <summary><span class="editor-section-kicker">Publishing</span><span class="editor-section-title">Publication settings</span></summary>
        <div class="form-grid">
          <label>Status
            <select name="status">
              <option value="draft" ${values?.status === "draft" ? "selected" : ""}>Draft</option>
              <option value="published" ${values?.status === "published" ? "selected" : ""}>Published</option>
            </select>
          </label>
        </div>
      </details>
      <div class="row">
        <button class="button button-primary" type="submit">Save form</button>
      </div>
    </form>
    ${structuredBuilderScript()}
  `;
}

function formFieldEditorRow(field: { name: string; label: string; type: string; required: boolean; options: string }) {
  return `<div class="structured-row" data-structured-row>
    <span class="structured-handle" aria-hidden="true"></span>
    <label>Field name<input data-part="name" value="${escapeHtml(field.name)}" placeholder="email" /></label>
    <label>Label<input data-part="label" value="${escapeHtml(field.label)}" placeholder="Email address" /></label>
    <label>Type<select data-part="type">${["text", "email", "textarea", "select", "checkbox"].map((type) => `<option value="${type}" ${field.type === type ? "selected" : ""}>${type}</option>`).join("")}</select></label>
    <label>Options<input data-part="options" value="${escapeHtml(field.options)}" placeholder="option1,option2" /></label>
    <label class="checkbox-label structured-required"><input type="checkbox" data-part="required" ${field.required ? "checked" : ""} /><span>Required</span></label>
    <button class="button structured-remove" type="button" data-remove-structured-row>Remove</button>
  </div>`;
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
  const items = (values?.itemsSpec ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label = "", url = "", openNewTab = "false"] = line.split("|");
      return { label, url, openNewTab: openNewTab.toLowerCase() === "true" };
    });
  return `
    <form method="post" action="${action}" class="editor-form form-grid">
      <section class="editor-section">
        <p class="editor-section-kicker">Menu setup</p>
        <h2 class="editor-section-title">Basic information</h2>
        <div class="form-grid">
          <label>Title <input name="title" value="${escapeHtml(values?.title ?? "")}" required /></label>
          <label>Slug <input name="slug" value="${escapeHtml(values?.slug ?? "")}" placeholder="main-navigation" required /></label>
        </div>
      </section>
      <section class="editor-section structured-builder" data-structured-builder="menu">
        <p class="editor-section-kicker">Navigation structure</p>
        <h2 class="editor-section-title">Menu items</h2>
        <p class="meta">Add links in their displayed order. External links can open in a new tab.</p>
        <div class="structured-rows" data-structured-rows>
          ${(items.length ? items : [{ label: "", url: "", openNewTab: false }]).map((item) => menuItemEditorRow(item)).join("")}
        </div>
        <button class="button structured-add" type="button" data-add-structured-row>Add menu item</button>
        <label class="structured-source">Menu items
          <textarea name="itemsSpec" placeholder="Home|/|false\nAbout|/about.php|false\nExternal|https://example.com|true">${escapeHtml(values?.itemsSpec ?? "")}</textarea>
        </label>
        <p class="meta structured-source">One item per line: <code>label|url|openNewTab</code>. Use <code>true</code> for a new tab. JavaScript and data URLs are blocked.</p>
      </section>
      <details class="editor-section editor-section-compact editor-collapsible">
        <summary><span class="editor-section-kicker">Publishing</span><span class="editor-section-title">Publication settings</span></summary>
        <div class="form-grid">
          <label>Status
            <select name="status">
              <option value="draft" ${values?.status === "draft" ? "selected" : ""}>Draft</option>
              <option value="published" ${values?.status === "published" ? "selected" : ""}>Published</option>
            </select>
          </label>
        </div>
      </details>
      <div class="row"><button class="button button-primary" type="submit">Save menu</button></div>
    </form>
    ${structuredBuilderScript()}
  `;
}

function menuItemEditorRow(item: { label: string; url: string; openNewTab: boolean }) {
  return `<div class="structured-row structured-row-menu" data-structured-row>
    <span class="structured-handle" aria-hidden="true"></span>
    <label>Label<input data-part="label" value="${escapeHtml(item.label)}" placeholder="About" /></label>
    <label>URL<input data-part="url" value="${escapeHtml(item.url)}" placeholder="/about.php" /></label>
    <label class="checkbox-label structured-required"><input type="checkbox" data-part="openNewTab" ${item.openNewTab ? "checked" : ""} /><span>Open in new tab</span></label>
    <button class="button structured-remove" type="button" data-remove-structured-row>Remove</button>
  </div>`;
}

function structuredBuilderScript() {
  return `<script>
    document.querySelectorAll("[data-structured-builder]").forEach((builder) => {
      const rows = builder.querySelector("[data-structured-rows]");
      const source = builder.querySelector("textarea[name=fieldsSpec], textarea[name=itemsSpec]");
      const kind = builder.dataset.structuredBuilder;
      if (!rows || !source) return;
      builder.classList.add("is-enhanced");
      const formRow = ${JSON.stringify(formFieldEditorRow({ name: "", label: "", type: "text", required: false, options: "" }))};
      const menuRow = ${JSON.stringify(menuItemEditorRow({ label: "", url: "", openNewTab: false }))};
      const sync = () => {
        source.value = Array.from(rows.querySelectorAll("[data-structured-row]")).map((row) => {
          const value = (part) => (row.querySelector("[data-part=" + part + "]")?.value || "").trim().replaceAll("|", "");
          const checked = (part) => Boolean(row.querySelector("[data-part=" + part + "]")?.checked);
          if (kind === "form") {
            const name = value("name");
            const label = value("label");
            const options = value("options");
            return name || label || options
              ? [name, label, value("type"), checked("required") ? "true" : "false", options].join("|")
              : "";
          }
          const label = value("label");
          const url = value("url");
          return label || url ? [label, url, checked("openNewTab") ? "true" : "false"].join("|") : "";
        }).filter(Boolean).join("\\n");
      };
      builder.addEventListener("input", sync);
      builder.addEventListener("change", sync);
      builder.addEventListener("click", (event) => {
        const remove = event.target.closest("[data-remove-structured-row]");
        if (remove) {
          remove.closest("[data-structured-row]")?.remove();
          if (!rows.children.length) rows.insertAdjacentHTML("beforeend", kind === "form" ? formRow : menuRow);
          sync();
          return;
        }
        if (event.target.closest("[data-add-structured-row]")) {
          rows.insertAdjacentHTML("beforeend", kind === "form" ? formRow : menuRow);
          rows.lastElementChild?.querySelector("input")?.focus();
          sync();
          window.applyAdminLocale?.(localStorage.getItem("hybrid-static-cms-locale") || "en");
        }
      });
      builder.closest("form")?.addEventListener("submit", sync);
      sync();
    });
  </script>`;
}

function blockValuesFromForm(form: FormData) {
  const requestedLayout = String(form.get("layoutType") ?? "plain");
  return {
    title: String(form.get("title") ?? ""),
    slug: String(form.get("slug") ?? "") || slugify(String(form.get("title") ?? "")),
    status: String(form.get("status") ?? "draft"),
    bodyHtml: String(form.get("bodyHtml") ?? ""),
    layoutType: requestedLayout as ContentBlockLayout,
  };
}

function blockForm(action: string, values?: Record<string, string>) {
  const selectedLayout = isContentBlockLayout(values?.layoutType) ? values.layoutType : "plain";
  const layoutOptions = contentBlockLayouts.map((layout) => `<label class="block-layout-option">
    <input type="radio" name="layoutType" value="${layout.id}" ${selectedLayout === layout.id ? "checked" : ""} />
    <span class="block-layout-option__visual block-layout-option__visual--${layout.id}" aria-hidden="true"><i></i><i></i><i></i></span>
    <span class="block-layout-option__copy"><strong>${layout.name}</strong><small>${layout.description}</small></span>
  </label>`).join("");
  return `
    <form method="post" action="${action}" class="editor-form form-grid">
      <section class="editor-section">
        <p class="editor-section-kicker">Block setup</p>
        <h2 class="editor-section-title">Basic information</h2>
        <div class="form-grid">
          <label>Title <input name="title" value="${escapeHtml(values?.title ?? "")}" required /></label>
          <label>Slug <input name="slug" value="${escapeHtml(values?.slug ?? "")}" placeholder="footer-cta" required /></label>
        </div>
      </section>
      <section class="editor-section">
        <p class="editor-section-kicker">Visual structure</p>
        <h2 class="editor-section-title">Block layout</h2>
        <p class="meta">Choose how this reusable content responds inside generated posts and fixed pages.</p>
        <fieldset class="block-layout-picker"><legend class="sr-only">Block layout</legend>${layoutOptions}</fieldset>
      </section>
      <section class="editor-section">
        <p class="editor-section-kicker">Reusable content</p>
        <h2 class="editor-section-title">Block body</h2>
        <div class="block-layout-workbench">
          <div class="block-layout-editor"><label>Body HTML <textarea name="bodyHtml" rows="14" required>${escapeHtml(values?.bodyHtml ?? "")}</textarea></label>${richEditorTools()}</div>
          <aside class="block-preview" data-block-preview>
            <div class="block-preview__heading"><div><p class="editor-section-kicker">Responsive preview</p><h3>Generated block</h3></div><div class="block-preview__sizes" role="group" aria-label="Preview width">
              <button class="button is-active" type="button" data-preview-size="desktop" aria-pressed="true">Desktop</button>
              <button class="button" type="button" data-preview-size="tablet" aria-pressed="false">Tablet</button>
              <button class="button" type="button" data-preview-size="mobile" aria-pressed="false">Mobile</button>
            </div></div>
            <div class="block-preview__viewport" data-preview-viewport="desktop"><iframe title="Block preview" sandbox></iframe></div>
            <p class="meta">Scripts, forms, and external requests are disabled in this preview.</p>
          </aside>
        </div>
      </section>
      <section class="editor-section editor-section-compact">
        <p class="editor-section-kicker">Placement</p>
        <h2 class="editor-section-title">Embed block</h2>
        <div class="usage-callout"><p>Use this snippet in a CMS-managed post or page body.</p><code>[[block:${escapeHtml(values?.slug || "slug")}]]</code></div>
      </section>
      <details class="editor-section editor-section-compact editor-collapsible">
        <summary><span class="editor-section-kicker">Publishing</span><span class="editor-section-title">Publication settings</span></summary>
        <div class="form-grid">
          <label>Status
            <select name="status">
              <option value="draft" ${values?.status === "draft" ? "selected" : ""}>Draft</option>
              <option value="published" ${values?.status === "published" ? "selected" : ""}>Published</option>
            </select>
          </label>
        </div>
      </details>
      <div class="row"><button class="button button-primary" type="submit">Save block</button></div>
    </form>
    ${blockPreviewScript()}
  `;
}

function mapValuesFromForm(form: FormData) {
  return {
    title: String(form.get("title") ?? ""),
    slug: String(form.get("slug") ?? "") || slugify(String(form.get("title") ?? "")),
    provider: String(form.get("provider") ?? "openstreetmap"),
    displayMode: String(form.get("displayMode") ?? "marker"),
    startLat: String(form.get("startLat") ?? ""),
    startLng: String(form.get("startLng") ?? ""),
    startLabel: String(form.get("startLabel") ?? ""),
    endLat: String(form.get("endLat") ?? ""),
    endLng: String(form.get("endLng") ?? ""),
    endLabel: String(form.get("endLabel") ?? ""),
    travelMode: String(form.get("travelMode") ?? "driving"),
    zoom: String(form.get("zoom") ?? "14"),
    height: String(form.get("height") ?? "480"),
    status: String(form.get("status") ?? "draft"),
  };
}

function mapInput(values: ReturnType<typeof mapValuesFromForm>): MapEmbedInput {
  const requiredNumber = (value: string) => value.trim() ? Number(value) : Number.NaN;
  return {
    title: values.title,
    slug: values.slug,
    provider: values.provider as MapEmbedInput["provider"],
    displayMode: values.displayMode as MapEmbedInput["displayMode"],
    startLat: requiredNumber(values.startLat),
    startLng: requiredNumber(values.startLng),
    startLabel: values.startLabel,
    endLat: values.endLat.trim() ? Number(values.endLat) : null,
    endLng: values.endLng.trim() ? Number(values.endLng) : null,
    endLabel: values.endLabel,
    travelMode: values.travelMode as MapEmbedInput["travelMode"],
    zoom: requiredNumber(values.zoom),
    height: requiredNumber(values.height),
    status: values.status as MapEmbedInput["status"],
  };
}

function mapForm(action: string, values: Partial<ReturnType<typeof mapValuesFromForm>> = {}) {
  const slug = values.slug || "map-slug";
  const shortcode = `[[map:${slug}]]`;
  const publicSnippet = `<div data-hsc-map="${slug}"></div>\n<script src="/cms/maps.js" defer></script>`;
  return `<form method="post" action="${action}" class="editor-form form-grid" data-map-form>
    <section class="editor-section">
      <p class="editor-section-kicker">Map snippet</p>
      <h2 class="editor-section-title">Basic information</h2>
      <div class="form-grid">
        <label>Title <input name="title" value="${escapeHtml(values.title ?? "")}" required /></label>
        <label>Slug <input name="slug" value="${escapeHtml(values.slug ?? "")}" placeholder="tokyo-station" required /></label>
        <div class="grid">
          <label>Map provider<select name="provider"><option value="openstreetmap" ${values.provider !== "google" ? "selected" : ""}>OpenStreetMap</option><option value="google" ${values.provider === "google" ? "selected" : ""}>Google Maps</option></select></label>
          <label>Display mode<select name="displayMode"><option value="marker" ${values.displayMode !== "route" ? "selected" : ""}>Pinpoint marker</option><option value="route" ${values.displayMode === "route" ? "selected" : ""}>Route</option></select></label>
          <label>Status<select name="status"><option value="draft" ${values.status !== "published" ? "selected" : ""}>Draft</option><option value="published" ${values.status === "published" ? "selected" : ""}>Published</option></select></label>
        </div>
      </div>
    </section>
    <section class="editor-section">
      <p class="editor-section-kicker">Locations</p>
      <h2 class="editor-section-title">Start and destination</h2>
      <div class="grid">
        <label>Start latitude <input type="number" step="any" min="-90" max="90" name="startLat" value="${escapeHtml(values.startLat ?? "35.681236")}" required /></label>
        <label>Start longitude <input type="number" step="any" min="-180" max="180" name="startLng" value="${escapeHtml(values.startLng ?? "139.767125")}" required /></label>
        <label>Start label <input name="startLabel" value="${escapeHtml(values.startLabel ?? "")}" placeholder="Tokyo Station" /></label>
      </div>
      <div class="grid" data-route-fields>
        <label>Destination latitude <input type="number" step="any" min="-90" max="90" name="endLat" value="${escapeHtml(values.endLat ?? "35.658034")}" /></label>
        <label>Destination longitude <input type="number" step="any" min="-180" max="180" name="endLng" value="${escapeHtml(values.endLng ?? "139.701636")}" /></label>
        <label>Destination label <input name="endLabel" value="${escapeHtml(values.endLabel ?? "")}" placeholder="Shibuya Station" /></label>
      </div>
    </section>
    <section class="editor-section">
      <p class="editor-section-kicker">Presentation</p>
      <h2 class="editor-section-title">Map display</h2>
      <div class="grid">
        <label>Travel mode<select name="travelMode"><option value="driving" ${values.travelMode !== "walking" && values.travelMode !== "bicycling" && values.travelMode !== "transit" ? "selected" : ""}>Driving</option><option value="walking" ${values.travelMode === "walking" ? "selected" : ""}>Walking</option><option value="bicycling" ${values.travelMode === "bicycling" ? "selected" : ""}>Bicycling</option><option value="transit" ${values.travelMode === "transit" ? "selected" : ""}>Transit</option></select></label>
        <label>Zoom <input type="number" name="zoom" min="0" max="21" value="${escapeHtml(values.zoom ?? "14")}" required /></label>
        <label>Height (px) <input type="number" name="height" min="200" max="1000" value="${escapeHtml(values.height ?? "480")}" required /></label>
      </div>
      <p class="meta">OpenStreetMap routes use the configured OSRM-compatible service. Transit routes require Google Maps.</p>
    </section>
    <section class="editor-section">
      <p class="editor-section-kicker">Placement</p>
      <h2 class="editor-section-title">Shortcode and public snippet</h2>
      <div class="grid">
        <div class="usage-callout"><p>CMS post or page body</p><code>${escapeHtml(shortcode)}</code></div>
        <div class="usage-callout"><p>Existing HTML or PHP under public_html</p><pre><code>${escapeHtml(publicSnippet)}</code></pre></div>
      </div>
      <p class="meta">Publish this map and regenerate public output after changing its settings.</p>
    </section>
    ${values.status === "published" ? `<section class="editor-section"><p class="editor-section-kicker">Preview</p><h2 class="editor-section-title">Published map preview</h2><div data-hsc-map="${escapeHtml(slug)}"></div><script src="/cms/maps.js" defer></script></section>` : ""}
    <div class="row"><button class="button button-primary" type="submit">Save map</button><a class="button" href="${config.controlPanelPath}/maps">Back to maps</a></div>
  </form>
  <script>(()=>{const form=document.querySelector('[data-map-form]');if(!form)return;const mode=form.querySelector('[name=displayMode]');const fields=form.querySelector('[data-route-fields]');const sync=()=>{const route=mode.value==='route';fields.hidden=!route;fields.querySelectorAll('input[type=number]').forEach((input)=>input.required=route);};mode.addEventListener('change',sync);sync();})();</script>`;
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
    <div style="margin-top:24px; padding:20px; border-radius:10px; background:var(--panel); border:1px solid var(--line); box-shadow:0 1px 3px rgba(0,0,0,0.04);">
      <h2>Protect a public_html file</h2>
      <p class="meta">Create a quick snapshot before changing surrounding templates or hand-edited site files.</p>
      <form method="post" action="${config.controlPanelPath}/snapshots" class="form-grid">
        <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}" />
        <label>Relative path inside public_html
          <input name="relativePath" placeholder="index.html or assets/css/site.css" required />
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
        preview = `<img src="${mediaPreviewUrl(item)}" alt="${escapeHtml(item.altText ?? item.originalName)}" style="max-width:120px; max-height:88px; border-radius:8px; border:1px solid var(--line);" loading="lazy" decoding="async" />`;
      } else if (isVideoMedia(item.mimeType)) {
        preview = `<video src="${item.publicUrl}" style="max-width:120px; max-height:88px; border-radius:8px; border:1px solid var(--line);" muted></video>`;
      } else if (isAudioMedia(item.mimeType)) {
        preview = `<span class="meta">Audio file</span>`;
      } else if (isPdfMedia(item.mimeType)) {
        preview = `<span class="meta">PDF file</span>`;
      }

      return `
        <article style="padding:18px; border-radius:10px; background:var(--panel); border:1px solid var(--line); box-shadow:0 1px 3px rgba(0,0,0,0.04); transition:box-shadow 0.18s ease;">
          <div style="margin-bottom:12px;">${preview}</div>
          <h3 style="font-size:1rem; margin-bottom:8px;">${escapeHtml(item.originalName)}</h3>
          <p class="meta" style="margin-bottom:10px;">${escapeHtml(item.mimeType)}</p>
          ${item.width && item.height ? `<p class="meta" style="margin-bottom:10px;"><span data-i18n="Dimensions">Dimensions</span>: ${item.width} × ${item.height} px · <span data-i18n="Variants">Variants</span>: ${item.variants.length}</p>` : ""}
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
    <div style="margin-top:24px; padding:18px 20px; border-radius:10px; background:var(--panel); border:1px solid var(--line); box-shadow:0 1px 3px rgba(0,0,0,0.04);">
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

function portabilityPage(c: Context) {
  const importedPosts = Number(c.req.query("importedPosts") ?? 0);
  const importedPages = Number(c.req.query("importedPages") ?? 0);
  const skippedPosts = Number(c.req.query("skippedPosts") ?? 0);
  const skippedPages = Number(c.req.query("skippedPages") ?? 0);
  const warnings = Number(c.req.query("warnings") ?? 0);
  const result = c.req.query("success") ? `
    <section class="editor-section">
      <p class="editor-section-kicker">Import result</p>
      <h2 class="editor-section-title">Content import completed</h2>
      <div class="grid">
        <div class="stat"><p class="meta">Imported posts</p><h2>${importedPosts}</h2></div>
        <div class="stat"><p class="meta">Imported pages</p><h2>${importedPages}</h2></div>
        <div class="stat"><p class="meta">Skipped existing items</p><h2>${skippedPosts + skippedPages}</h2></div>
        <div class="stat"><p class="meta">Warnings</p><h2>${warnings}</h2></div>
      </div>
      <p class="meta">Imported content is saved as draft. Review it before publishing.</p>
    </section>` : "";
  return `
    ${queryNotice(c)}
    ${result}
    <section class="editor-section">
      <p class="editor-section-kicker">Portability</p>
      <h2 class="editor-section-title">Export posts and pages</h2>
      <p class="meta">Download a versioned JSON archive containing post and page bodies, SEO settings, terms, and parent collection slugs. User accounts, comments, media files, credentials, and audit logs are excluded.</p>
      <div><a class="button primary" href="${config.controlPanelPath}/portability/export">Download content archive</a></div>
    </section>
    <section class="editor-section">
      <p class="editor-section-kicker">Safe import</p>
      <h2 class="editor-section-title">Import posts and pages</h2>
      <p class="meta">Every imported item is created as a draft. Existing slugs are skipped and never overwritten. Series and page groups are connected only when matching parent slugs already exist.</p>
      <form method="post" action="${config.controlPanelPath}/portability/import" enctype="multipart/form-data" class="form-grid">
        <label>Content archive (JSON)
          <input type="file" name="archive" accept="application/json,.json" required />
        </label>
        <p class="meta">Maximum file size: 5 MB. Maximum content items: 1000.</p>
        <label class="row"><input type="checkbox" name="confirm" value="yes" required /> I understand that imported content will be added as drafts.</label>
        <div><button class="button primary" type="submit">Validate and import</button></div>
      </form>
    </section>
  `;
}

adminRoutes.get("/portability", async (c) => c.html(adminLayout("Import and export", c.get("sessionUser"), portabilityPage(c))));

adminRoutes.get("/portability/export", async (c) => {
  const user = c.get("sessionUser");
  const archive = await createContentArchive();
  await writeAuditLog({
    actorUserId: user?.id ?? null,
    action: "content.export",
    targetType: "content_archive",
    summary: `Exported ${archive.posts.length} posts and ${archive.pages.length} pages.`,
    ipAddress: requestIp(c),
  });
  c.header("Content-Type", "application/json; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="hybrid-static-cms-content-${new Date().toISOString().slice(0, 10)}.json"`);
  c.header("Cache-Control", "no-store");
  return c.body(`${JSON.stringify(archive, null, 2)}\n`);
});

adminRoutes.post("/portability/import", async (c) => {
  const user = c.get("sessionUser");
  if (!user) return c.redirect("/login");
  try {
    const contentLength = Number(c.req.header("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > contentArchiveMaxBytes + 1_048_576) {
      throw new AppValidationError("The import file exceeds the 5 MB limit.");
    }
    const form = await c.req.formData();
    const file = form.get("archive");
    if (form.get("confirm") !== "yes") throw new AppValidationError("Confirm the content import before continuing.");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".json")) throw new AppValidationError("Select a JSON content archive.");
    if (file.size > contentArchiveMaxBytes) throw new AppValidationError("The import file exceeds the 5 MB limit.");
    const result = await importContentArchive(parseContentArchive(await file.text()), user.id);
    await writeAuditLog({
      actorUserId: user.id,
      action: "content.import",
      targetType: "content_archive",
      summary: `Imported ${result.importedPosts} posts and ${result.importedPages} pages as drafts; skipped ${result.skippedPosts + result.skippedPages} existing slugs with ${result.warnings.length} warnings.`,
      ipAddress: requestIp(c),
    });
    const params = new URLSearchParams({
      success: "Content import completed.",
      importedPosts: String(result.importedPosts), importedPages: String(result.importedPages),
      skippedPosts: String(result.skippedPosts), skippedPages: String(result.skippedPages), warnings: String(result.warnings.length),
    });
    return c.redirect(`${config.controlPanelPath}/portability?${params}`);
  } catch (error) {
    if (error instanceof AppValidationError) {
      return c.html(adminLayout("Import and export", user, noticeCard(error.message, "error") + portabilityPage(c)), 400);
    }
    throw error;
  }
});

function redirectInputFromForm(form: FormData) {
  return {
    sourcePath: String(form.get("sourcePath") ?? ""),
    targetLocation: String(form.get("targetLocation") ?? ""),
    statusCode: Number(form.get("statusCode") ?? 301),
    enabled: form.get("enabled") === "true",
    note: String(form.get("note") ?? ""),
  };
}

function redirectStatusOptions(selected: number) {
  return [
    [301, "301 Permanent"], [302, "302 Temporary"], [307, "307 Temporary (preserve method)"], [308, "308 Permanent (preserve method)"],
  ].map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`).join("");
}

adminRoutes.get("/redirects", async (c) => {
  const user = c.get("sessionUser");
  const q = c.req.query("q") ?? "";
  const [redirects, reports] = await Promise.all([listRedirects(q), listNotFoundReports(q)]);
  const canWrite = hasPermission(user, "redirects.write");
  const canDelete = hasPermission(user, "redirects.delete");
  const body = `
    ${queryNotice(c)}
    ${canWrite ? `<section class="editor-section">
      <p class="editor-section-kicker">Redirect manager</p>
      <h2 class="editor-section-title">Add redirect</h2>
      <p class="meta">Use an internal source path. Targets may be internal paths or HTTPS URLs. Permanent redirects are recommended for established URL changes.</p>
      <form method="post" action="${config.controlPanelPath}/redirects" class="form-grid">
        <div class="grid">
          <label>Source path<input name="sourcePath" placeholder="/old-page.html" required /></label>
          <label>Target location<input name="targetLocation" placeholder="/new-page.html" required /></label>
          <label>Status code<select name="statusCode">${redirectStatusOptions(301)}</select></label>
        </div>
        <label>Note<input name="note" maxlength="1000" placeholder="Why this redirect exists" /></label>
        <label class="row"><input type="checkbox" name="enabled" value="true" checked /> Enabled</label>
        <div><button class="button primary" type="submit">Add redirect</button></div>
      </form>
    </section>` : ""}
    <section class="editor-section">
      <div class="section-heading-row"><div><p class="editor-section-kicker">Routing rules</p><h2 class="editor-section-title">Redirects</h2></div>
        <form method="get" action="${config.controlPanelPath}/redirects" class="row"><input name="q" value="${escapeHtml(q)}" placeholder="Search paths" /><button class="button" type="submit">Search</button></form>
      </div>
      <div class="table-scroll"><table class="data-table">
        <thead><tr><th>Source</th><th>Target</th><th>Status</th><th>Enabled</th><th>Origin</th><th>Hits</th><th>Last hit</th><th>Note</th><th>Actions</th></tr></thead>
        <tbody>${redirects.map((item) => {
          const formId = `redirect-${item.id}`;
          return `<tr>
            <td><input form="${formId}" name="sourcePath" value="${escapeHtml(item.sourcePath)}" ${canWrite ? "" : "readonly"} /></td>
            <td><input form="${formId}" name="targetLocation" value="${escapeHtml(item.targetLocation)}" ${canWrite ? "" : "readonly"} /></td>
            <td><select form="${formId}" name="statusCode" ${canWrite ? "" : "disabled"}>${redirectStatusOptions(item.statusCode)}</select></td>
            <td><input form="${formId}" type="checkbox" name="enabled" value="true" ${item.enabled ? "checked" : ""} ${canWrite ? "" : "disabled"} /></td>
            <td>${item.automatic ? "Automatic" : "Manual"}</td><td>${item.hitCount}</td><td>${item.lastHitAt ? adminDate(item.lastHitAt) : "Never"}</td>
            <td class="cell-long"><input form="${formId}" name="note" maxlength="1000" value="${escapeHtml(item.note ?? "")}" ${canWrite ? "" : "readonly"} /></td>
            <td class="cell-actions">${canWrite ? `<form id="${formId}" method="post" action="${config.controlPanelPath}/redirects/${item.id}"><button class="button" type="submit">Save</button></form>` : ""}${canDelete ? `<form method="post" action="${config.controlPanelPath}/redirects/${item.id}/delete"><button class="button danger" type="submit">Delete</button></form>` : ""}</td>
          </tr>`;
        }).join("") || `<tr><td colspan="9">No redirects found.</td></tr>`}</tbody>
      </table></div>
    </section>
    <section class="editor-section">
      <div class="section-heading-row"><div><p class="editor-section-kicker">Broken links</p><h2 class="editor-section-title">404 report</h2></div>
        ${canDelete && reports.length ? `<form method="post" action="${config.controlPanelPath}/redirects/reports/clear"><label class="row"><input type="checkbox" name="confirm" value="yes" required /> Confirm clear</label><button class="button danger" type="submit">Clear all reports</button></form>` : ""}
      </div>
      <p class="meta">Reports contain the requested path, aggregate count, timestamps, and only the referrer origin. Visitor IP addresses and complete referrer URLs are not stored.</p>
      <div class="table-scroll"><table class="data-table">
        <thead><tr><th>Missing path</th><th>Hits</th><th>First seen</th><th>Last seen</th><th>Referrer origin</th><th>Resolution</th></tr></thead>
        <tbody>${reports.map((report) => `<tr>
          <td><code>${escapeHtml(report.requestPath)}</code></td><td>${report.hitCount}</td><td>${adminDate(report.firstSeenAt)}</td><td>${adminDate(report.lastSeenAt)}</td><td>${escapeHtml(report.lastReferrerOrigin ?? "Direct or unknown")}</td>
          <td class="cell-actions">${canWrite ? `<form method="post" action="${config.controlPanelPath}/redirects/reports/${report.id}/resolve" class="row"><input type="hidden" name="sourcePath" value="${escapeHtml(report.requestPath)}" /><input name="targetLocation" placeholder="/replacement.html" required /><select name="statusCode">${redirectStatusOptions(301)}</select><input type="hidden" name="enabled" value="true" /><button class="button" type="submit">Create redirect</button></form>` : ""}${canDelete ? `<form method="post" action="${config.controlPanelPath}/redirects/reports/${report.id}/dismiss"><button class="button" type="submit">Dismiss</button></form>` : ""}</td>
        </tr>`).join("") || `<tr><td colspan="6">No 404 reports found.</td></tr>`}</tbody>
      </table></div>
    </section>`;
  return c.html(adminLayout("Redirects and 404s", user, body, "wide-list"));
});

adminRoutes.post("/redirects", async (c) => {
  const user = c.get("sessionUser");
  try {
    const item = await createRedirect(redirectInputFromForm(await c.req.formData()), user?.id ?? null);
    await writeAuditLog({ actorUserId: user?.id ?? null, action: "redirect.create", targetType: "site_redirect", targetId: item?.id ?? null, summary: `Created redirect from "${item?.sourcePath ?? ""}".`, ipAddress: requestIp(c) });
    return c.redirect(`${config.controlPanelPath}/redirects?success=${encodeURIComponent("Redirect created.")}`);
  } catch (error) {
    if (error instanceof AppValidationError) return c.redirect(`${config.controlPanelPath}/redirects?error=${encodeURIComponent(error.message)}`);
    throw error;
  }
});

adminRoutes.post("/redirects/:id", async (c) => {
  const user = c.get("sessionUser");
  try {
    const item = await updateRedirect(Number(c.req.param("id")), redirectInputFromForm(await c.req.formData()));
    await writeAuditLog({ actorUserId: user?.id ?? null, action: "redirect.update", targetType: "site_redirect", targetId: c.req.param("id"), summary: `Updated redirect from "${item?.sourcePath ?? ""}".`, ipAddress: requestIp(c) });
    return c.redirect(`${config.controlPanelPath}/redirects?success=${encodeURIComponent("Redirect updated.")}`);
  } catch (error) {
    if (error instanceof AppValidationError) return c.redirect(`${config.controlPanelPath}/redirects?error=${encodeURIComponent(error.message)}`);
    throw error;
  }
});

adminRoutes.post("/redirects/:id/delete", async (c) => {
  const user = c.get("sessionUser");
  await deleteRedirect(Number(c.req.param("id")));
  await writeAuditLog({ actorUserId: user?.id ?? null, action: "redirect.delete", targetType: "site_redirect", targetId: c.req.param("id"), summary: `Deleted redirect #${c.req.param("id")}.`, ipAddress: requestIp(c) });
  return c.redirect(`${config.controlPanelPath}/redirects?success=${encodeURIComponent("Redirect deleted.")}`);
});

adminRoutes.post("/redirects/reports/:id/resolve", async (c) => {
  const user = c.get("sessionUser");
  const report = await getNotFoundReportById(Number(c.req.param("id")));
  if (!report) return c.text("Not found", 404);
  try {
    const item = await createRedirect(redirectInputFromForm(await c.req.formData()), user?.id ?? null);
    await deleteNotFoundReport(report.id);
    await writeAuditLog({ actorUserId: user?.id ?? null, action: "redirect.create_from_404", targetType: "site_redirect", targetId: item?.id ?? null, summary: `Resolved 404 path "${report.requestPath}" with a redirect.`, ipAddress: requestIp(c) });
    return c.redirect(`${config.controlPanelPath}/redirects?success=${encodeURIComponent("Redirect created and 404 report resolved.")}`);
  } catch (error) {
    if (error instanceof AppValidationError) return c.redirect(`${config.controlPanelPath}/redirects?error=${encodeURIComponent(error.message)}`);
    throw error;
  }
});

adminRoutes.post("/redirects/reports/:id/dismiss", async (c) => {
  const report = await getNotFoundReportById(Number(c.req.param("id")));
  await deleteNotFoundReport(Number(c.req.param("id")));
  await writeAuditLog({ actorUserId: c.get("sessionUser")?.id ?? null, action: "redirect.404_dismiss", targetType: "not_found_report", targetId: c.req.param("id"), summary: `Dismissed 404 report for "${report?.requestPath ?? "unknown"}".`, ipAddress: requestIp(c) });
  return c.redirect(`${config.controlPanelPath}/redirects?success=${encodeURIComponent("404 report dismissed.")}`);
});

adminRoutes.post("/redirects/reports/clear", async (c) => {
  const form = await c.req.formData();
  if (form.get("confirm") !== "yes") return c.redirect(`${config.controlPanelPath}/redirects?error=${encodeURIComponent("Confirm before clearing 404 reports.")}`);
  const count = await clearNotFoundReports();
  await writeAuditLog({ actorUserId: c.get("sessionUser")?.id ?? null, action: "redirect.404_clear", targetType: "not_found_report", summary: `Cleared ${count} aggregated 404 reports.`, ipAddress: requestIp(c) });
  return c.redirect(`${config.controlPanelPath}/redirects?success=${encodeURIComponent("404 reports cleared.")}`);
});

adminRoutes.get("/search", async (c) => {
  const user = c.get("sessionUser");
  const q = c.req.query("q") ?? "";
  const status = c.req.query("status") === "published" ? "published" : "any";
  const [diagnostics, results] = await Promise.all([
    getSearchDiagnostics(),
    q.trim() ? searchContent(q, { status, limit: 100 }) : Promise.resolve({ query: "", total: 0, items: [] }),
  ]);
  const canManage = hasPermission(user, "search.manage");
  const body = `
    ${queryNotice(c)}
    <section class="editor-section">
      <p class="editor-section-kicker">Japanese-aware search</p>
      <h2 class="editor-section-title">Content search</h2>
      <p class="meta">Search post and page titles, excerpts, and body text. Full-width and half-width characters are normalized, and short Japanese terms are supported.</p>
      <form method="get" action="${config.controlPanelPath}/search" class="form-grid">
        <div class="grid">
          <label>Search query<input name="q" value="${escapeHtml(q)}" maxlength="200" placeholder="Search posts and pages" /></label>
          <label>Content status<select name="status"><option value="any" ${status === "any" ? "selected" : ""}>All content</option><option value="published" ${status === "published" ? "selected" : ""}>Published content</option></select></label>
        </div>
        <div><button class="button primary" type="submit">Search</button></div>
      </form>
    </section>
    <section class="editor-section">
      <div class="section-heading-row"><div><p class="editor-section-kicker">Search index</p><h2 class="editor-section-title">Index health</h2></div><span class="badge">${diagnostics.healthy ? "Healthy" : "Needs attention"}</span></div>
      <div class="grid">
        <div class="stat"><p class="meta">Indexed posts</p><h2>${diagnostics.posts.indexed} / ${diagnostics.posts.total}</h2></div>
        <div class="stat"><p class="meta">Indexed pages</p><h2>${diagnostics.pages.indexed} / ${diagnostics.pages.total}</h2></div>
        <div class="stat"><p class="meta">pg_trgm version</p><h2>${escapeHtml(diagnostics.extensionVersion ?? "Unavailable")}</h2></div>
        <div class="stat"><p class="meta">Search indexes</p><h2>${diagnostics.indexes.filter((index) => index.healthy).length} / 2</h2></div>
      </div>
      ${canManage ? `<form method="post" action="${config.controlPanelPath}/search/reindex"><p class="meta">Rebuild indexes concurrently if diagnostics report a problem. Normal searches remain available during the operation.</p><button class="button" type="submit">Rebuild search indexes</button></form>` : ""}
    </section>
    <section class="editor-section">
      <p class="editor-section-kicker">Results</p>
      <h2 class="editor-section-title">Search results</h2>
      ${q.trim() ? `<p class="meta"><strong>${results.total}</strong> <span data-i18n="Matches">Matches</span></p>` : ""}
      <div class="table-scroll"><table class="data-table"><thead><tr><th>Type</th><th>Title</th><th>Status</th><th>Relevance</th><th>Updated</th><th>Actions</th></tr></thead>
        <tbody>${results.items.map((item) => `<tr><td>${item.type === "post" ? "Post" : "Page"}</td><td class="cell-long"><strong>${escapeHtml(item.title)}</strong>${item.excerpt ? `<br><span class="meta">${escapeHtml(item.excerpt)}</span>` : ""}</td><td>${escapeHtml(item.status)}</td><td>${item.score.toFixed(2)}</td><td>${adminDate(item.updatedAt)}</td><td><a class="button" href="${config.controlPanelPath}/${item.type === "post" ? "posts" : "pages"}/${item.id}/edit">Edit</a></td></tr>`).join("") || `<tr><td colspan="6">${q.trim() ? "No search results." : "Enter a search query."}</td></tr>`}</tbody>
      </table></div>
    </section>`;
  return c.html(adminLayout("Content search", user, body, "wide-list"));
});

adminRoutes.post("/search/reindex", async (c) => {
  const user = c.get("sessionUser");
  try {
    await rebuildSearchIndexes();
    await writeAuditLog({ actorUserId: user?.id ?? null, action: "search.reindex", targetType: "search_index", summary: "Rebuilt post and page search indexes.", ipAddress: requestIp(c) });
    return c.redirect(`${config.controlPanelPath}/search?success=${encodeURIComponent("Search indexes rebuilt.")}`);
  } catch (error) {
    logError("search.reindex_failed", "Search index rebuild failed.", { error });
    return c.redirect(`${config.controlPanelPath}/search?error=${encodeURIComponent("Search index rebuild failed.")}`);
  }
});

async function handleEditorialWorkflow(c: Context, contentType: EditorialContentType) {
  const user = c.get("sessionUser");
  if (!user) return c.redirect("/login");
  const contentId = Number(c.req.param("id"));
  const action = c.req.param("action") as EditorialWorkflowAction;
  if (!["submit", "approve", "request_changes", "withdraw"].includes(action)) return c.text("Not found", 404);
  const content = contentType === "post" ? await getPostById(contentId) : await getPageById(contentId);
  if (!content) return c.text("Not found", 404);
  const editPath = `${config.controlPanelPath}/${contentType === "post" ? "posts" : "pages"}/${contentId}/edit`;
  const reviewPermission = contentType === "post" ? "posts.review" : "pages.review";
  const form = await c.req.formData();
  const note = String(form.get("note") ?? "");

  try {
    if ((action === "approve" || action === "request_changes") && !hasPermission(user, reviewPermission)) {
      return c.text("Forbidden", 403);
    }
    if (action === "withdraw" && !hasPermission(user, reviewPermission) && user.id !== content.authorId && user.id !== content.reviewRequestedBy) {
      return c.text("Forbidden", 403);
    }
    if (action === "submit") await submitContentForReview(contentType, contentId, user.id, note);
    if (action === "approve") await approveContentReview(contentType, contentId, user.id, note);
    if (action === "request_changes") await requestContentChanges(contentType, contentId, user.id, note);
    if (action === "withdraw") await withdrawContentReview(contentType, contentId, user.id);
  } catch (error) {
    if (error instanceof AppValidationError) return c.redirect(`${editPath}?error=${encodeURIComponent(error.message)}`);
    throw error;
  }

  const successMessages: Record<EditorialWorkflowAction, string> = {
    submit: "Review requested.",
    approve: "Review approved.",
    request_changes: "Changes requested.",
    withdraw: "Review withdrawn.",
  };
  await writeAuditLog({
    actorUserId: user.id,
    action: `editorial.${contentType}.${action}`,
    targetType: contentType,
    targetId: contentId,
    summary: `${workflowActionLabels[action]} for ${contentType} #${contentId}.`,
    ipAddress: requestIp(c),
  });
  return c.redirect(`${editPath}?success=${encodeURIComponent(successMessages[action])}`);
}

adminRoutes.post("/posts/:id/workflow/:action", (c) => handleEditorialWorkflow(c, "post"));
adminRoutes.post("/pages/:id/workflow/:action", (c) => handleEditorialWorkflow(c, "page"));

async function autosaveResponse(c: Context, contentType: AutosaveContentType) {
  const user = c.get("sessionUser");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const autosave = await getEditorAutosave(user.id, contentType, String(c.req.param("key") ?? ""));
    return c.json({ autosave });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unable to load autosave." }, 400);
  }
}

async function saveAutosaveResponse(c: Context, contentType: AutosaveContentType) {
  const user = c.get("sessionUser");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const body = await c.req.json();
    const updatedAt = await saveEditorAutosave(user.id, contentType, String(c.req.param("key") ?? ""), body.payload, body.baseUpdatedAt);
    return c.json({ updatedAt });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unable to autosave." }, 400);
  }
}

async function deleteAutosaveResponse(c: Context, contentType: AutosaveContentType) {
  const user = c.get("sessionUser");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    await deleteEditorAutosave(user.id, contentType, String(c.req.param("key") ?? ""));
    return c.json({ deleted: true });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unable to discard autosave." }, 400);
  }
}

async function clearSubmittedAutosave(userId: number, contentType: AutosaveContentType, key: string) {
  if (/^[A-Za-z0-9_-]{1,96}$/.test(key)) {
    await deleteEditorAutosave(userId, contentType, key).catch(() => undefined);
  }
}

adminRoutes.get("/posts/autosave/:key", (c) => autosaveResponse(c, "post"));
adminRoutes.post("/posts/autosave/:key", (c) => saveAutosaveResponse(c, "post"));
adminRoutes.post("/posts/autosave/:key/delete", (c) => deleteAutosaveResponse(c, "post"));
adminRoutes.get("/pages/autosave/:key", (c) => autosaveResponse(c, "page"));
adminRoutes.post("/pages/autosave/:key", (c) => saveAutosaveResponse(c, "page"));
adminRoutes.post("/pages/autosave/:key/delete", (c) => deleteAutosaveResponse(c, "page"));

function recoveryCodesPage(_user: SessionUser, codes: string[]) {
  return `
    <section class="editor-section">
      <p class="editor-section-kicker">Account security</p>
      <h2 class="editor-section-title">Save your recovery codes</h2>
      <div class="security-warning">
        <strong>These codes are shown only once.</strong>
        <p>Store them in a password manager or another protected offline location. Each code can be used only once.</p>
      </div>
      <div class="recovery-code-grid">${codes.map((code) => `<code>${escapeHtml(code)}</code>`).join("")}</div>
      <p><a class="button button-primary" href="${config.controlPanelPath}/security">Return to account security</a></p>
    </section>`;
}

adminRoutes.get("/security", async (c) => {
  const user = c.get("sessionUser");
  if (!user) return c.redirect("/login");
  c.header("Cache-Control", "no-store");
  const [security, pending] = await Promise.all([
    getAccountSecurity(user.id, user.sessionId),
    getPendingTotpEnrollment(user.id, user.email),
  ]);
  const body = `${queryNotice(c)}
    <div class="account-security-page">
      <section class="editor-section">
        <p class="editor-section-kicker">Password</p>
        <h2 class="editor-section-title">Change password</h2>
        <p class="meta">Changing your password signs out every other session.</p>
        <form method="post" action="${config.controlPanelPath}/security/password" class="form-grid">
          <label>Current password <input type="password" name="currentPassword" autocomplete="current-password" required /></label>
          <label>New password <input type="password" name="newPassword" autocomplete="new-password" minlength="12" required /></label>
          <label>Confirm new password <input type="password" name="confirmPassword" autocomplete="new-password" minlength="12" required /></label>
          <div><button class="button button-primary" type="submit">Change password</button></div>
        </form>
      </section>
      <section class="editor-section">
        <p class="editor-section-kicker">Two-factor authentication</p>
        <div class="section-heading-row"><div><h2 class="editor-section-title">Authenticator app</h2><p class="meta">${security.twoFactorEnabled ? `<span>Enabled</span> · ${security.recoveryCodesRemaining} <span>recovery codes remaining</span>` : "Not enabled"}</p></div><span class="media-usage-badge ${security.twoFactorEnabled ? "media-usage-used" : "media-usage-unused"}">${security.twoFactorEnabled ? "Enabled" : "Disabled"}</span></div>
        ${security.twoFactorEnabled ? `
          <div class="security-action-grid">
            <form method="post" action="${config.controlPanelPath}/security/2fa/recovery-codes" class="form-grid">
              <h3>Generate new recovery codes</h3>
              <p class="meta">Existing recovery codes become invalid immediately.</p>
              <label>Current password <input type="password" name="currentPassword" autocomplete="current-password" required /></label>
              <label>Authenticator code <input name="code" inputmode="numeric" pattern="[0-9]{6}" autocomplete="one-time-code" required /></label>
              <button class="button" type="submit">Replace recovery codes</button>
            </form>
            <form method="post" action="${config.controlPanelPath}/security/2fa/disable" class="form-grid security-danger-zone">
              <h3>Disable two-factor authentication</h3>
              <p class="meta">This also invalidates every recovery code and signs out other sessions.</p>
              <label>Current password <input type="password" name="currentPassword" autocomplete="current-password" required /></label>
              <label>Authenticator or recovery code <input name="code" autocomplete="one-time-code" required /></label>
              <button class="button" type="submit">Disable two-factor authentication</button>
            </form>
          </div>` : pending ? `
          <div class="security-enrollment">
            <h3>Connect your authenticator app</h3>
            <ol><li>Add a new time-based account in your authenticator app.</li><li>Enter the secret or use the setup URI.</li><li>Confirm with the current six-digit code.</li></ol>
            <dl class="security-secret"><dt>Secret</dt><dd><code>${escapeHtml(pending.secret)}</code></dd><dt>Setup URI</dt><dd><code>${escapeHtml(pending.uri)}</code></dd></dl>
            <form method="post" action="${config.controlPanelPath}/security/2fa/confirm" class="form-grid">
              <label>Authenticator code <input name="code" inputmode="numeric" pattern="[0-9]{6}" autocomplete="one-time-code" required /></label>
              <div><button class="button button-primary" type="submit">Enable two-factor authentication</button></div>
            </form>
          </div>` : `
          <p>Use a personal authenticator secret instead of sharing the installation-wide TOTP secret.</p>
          <form method="post" action="${config.controlPanelPath}/security/2fa/start" class="form-grid">
            <label>Current password <input type="password" name="currentPassword" autocomplete="current-password" required /></label>
            <div><button class="button button-primary" type="submit">Start two-factor enrollment</button></div>
          </form>`}
      </section>
      <section class="editor-section">
        <p class="editor-section-kicker">Sessions</p>
        <div class="section-heading-row"><div><h2 class="editor-section-title">Signed-in devices</h2><p class="meta">Review where this account is currently signed in.</p></div>${security.sessions.length > 1 ? `<form method="post" action="${config.controlPanelPath}/security/sessions/revoke-others"><button class="button" type="submit">Sign out other sessions</button></form>` : ""}</div>
        <div class="session-list">
          ${security.sessions.map((session) => `<article class="session-item">
            <div><strong>${session.current ? "Current session" : escapeHtml(session.userAgent?.slice(0, 120) || "Unknown browser")}</strong><p class="meta">${session.createdIp ? `IP ${escapeHtml(session.createdIp)} · ` : ""}<span>Last active</span> ${adminDate(session.lastSeenAt)} · <span>Expires</span> ${adminDate(session.expiresAt)}</p>${session.current ? `<span class="media-usage-badge media-usage-used">This device</span>` : ""}</div>
            ${session.current ? "" : `<form method="post" action="${config.controlPanelPath}/security/sessions/${session.id}/revoke"><button class="button" type="submit">Sign out</button></form>`}
          </article>`).join("")}
        </div>
      </section>
    </div>`;
  return c.html(adminLayout("Account Security", user, body));
});

adminRoutes.post("/security/password", async (c) => {
  const user = c.get("sessionUser");
  if (!user) return c.redirect("/login");
  const form = await c.req.formData();
  const currentPassword = String(form.get("currentPassword") ?? "");
  const newPassword = String(form.get("newPassword") ?? "");
  if (newPassword !== String(form.get("confirmPassword") ?? "")) {
    return c.redirect(`${config.controlPanelPath}/security?error=${encodeURIComponent("New password confirmation does not match.")}`);
  }
  try {
    await changeOwnPassword(user.id, currentPassword, newPassword, user.sessionId);
    await writeAuditLog({ actorUserId: user.id, action: "auth.password_change", targetType: "user", targetId: user.id, summary: "Changed own password and revoked other sessions.", ipAddress: requestIp(c) });
    return c.redirect(`${config.controlPanelPath}/security?success=${encodeURIComponent("Password changed. Other sessions were signed out.")}`);
  } catch (error) {
    return c.redirect(`${config.controlPanelPath}/security?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to change password.")}`);
  }
});

adminRoutes.post("/security/2fa/start", async (c) => {
  const user = c.get("sessionUser");
  if (!user) return c.redirect("/login");
  try {
    await startTotpEnrollment(user.id, user.email, String((await c.req.formData()).get("currentPassword") ?? ""));
    await writeAuditLog({ actorUserId: user.id, action: "auth.2fa_enrollment_start", targetType: "user", targetId: user.id, summary: "Started personal two-factor enrollment.", ipAddress: requestIp(c) });
    return c.redirect(`${config.controlPanelPath}/security?success=${encodeURIComponent("Enter the authenticator code to finish enrollment.")}`);
  } catch (error) {
    return c.redirect(`${config.controlPanelPath}/security?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to start enrollment.")}`);
  }
});

adminRoutes.post("/security/2fa/confirm", async (c) => {
  const user = c.get("sessionUser");
  if (!user) return c.redirect("/login");
  try {
    const codes = await confirmTotpEnrollment(user.id, String((await c.req.formData()).get("code") ?? ""), user.sessionId);
    await writeAuditLog({ actorUserId: user.id, action: "auth.2fa_enable", targetType: "user", targetId: user.id, summary: "Enabled personal two-factor authentication.", ipAddress: requestIp(c) });
    c.header("Cache-Control", "no-store");
    return c.html(adminLayout("Recovery Codes", user, recoveryCodesPage(user, codes)));
  } catch (error) {
    return c.redirect(`${config.controlPanelPath}/security?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to enable two-factor authentication.")}`);
  }
});

adminRoutes.post("/security/2fa/recovery-codes", async (c) => {
  const user = c.get("sessionUser");
  if (!user) return c.redirect("/login");
  const form = await c.req.formData();
  try {
    const codes = await regenerateRecoveryCodes(user.id, String(form.get("currentPassword") ?? ""), String(form.get("code") ?? ""));
    await writeAuditLog({ actorUserId: user.id, action: "auth.recovery_codes_replace", targetType: "user", targetId: user.id, summary: "Replaced personal two-factor recovery codes.", ipAddress: requestIp(c) });
    c.header("Cache-Control", "no-store");
    return c.html(adminLayout("Recovery Codes", user, recoveryCodesPage(user, codes)));
  } catch (error) {
    return c.redirect(`${config.controlPanelPath}/security?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to replace recovery codes.")}`);
  }
});

adminRoutes.post("/security/2fa/disable", async (c) => {
  const user = c.get("sessionUser");
  if (!user) return c.redirect("/login");
  const form = await c.req.formData();
  try {
    await disableTotp(user.id, String(form.get("currentPassword") ?? ""), String(form.get("code") ?? ""), user.sessionId);
    await writeAuditLog({ actorUserId: user.id, action: "auth.2fa_disable", targetType: "user", targetId: user.id, summary: "Disabled personal two-factor authentication.", ipAddress: requestIp(c) });
    return c.redirect(`${config.controlPanelPath}/security?success=${encodeURIComponent("Two-factor authentication disabled.")}`);
  } catch (error) {
    return c.redirect(`${config.controlPanelPath}/security?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to disable two-factor authentication.")}`);
  }
});

adminRoutes.post("/security/sessions/revoke-others", async (c) => {
  const user = c.get("sessionUser");
  if (!user) return c.redirect("/login");
  const count = await revokeOtherSessions(user.id, user.sessionId);
  await writeAuditLog({ actorUserId: user.id, action: "auth.sessions_revoke_others", targetType: "user", targetId: user.id, summary: `Revoked ${count} other session(s).`, ipAddress: requestIp(c) });
  return c.redirect(`${config.controlPanelPath}/security?success=${encodeURIComponent("Other sessions signed out.")}`);
});

adminRoutes.post("/security/sessions/:id/revoke", async (c) => {
  const user = c.get("sessionUser");
  if (!user) return c.redirect("/login");
  try {
    const revoked = await revokeOwnSession(user.id, Number(c.req.param("id")), user.sessionId);
    if (revoked) await writeAuditLog({ actorUserId: user.id, action: "auth.session_revoke", targetType: "session", targetId: c.req.param("id"), summary: "Revoked an account session.", ipAddress: requestIp(c) });
    return c.redirect(`${config.controlPanelPath}/security?success=${encodeURIComponent(revoked ? "Session signed out." : "Session was already inactive.")}`);
  } catch (error) {
    return c.redirect(`${config.controlPanelPath}/security?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to revoke session.")}`);
  }
});

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
            <td>${item.roles.map((role) => `<span style="display:inline-block; margin:2px 4px 2px 0; padding:3px 10px; border-radius:100px; background:rgba(65,201,180,0.1); color:#2a7a6e; font-size:0.8rem; font-weight:500;">${escapeHtml(role)}</span>`).join("") || "-"}</td>
            <td>${item.isActive ? "Active" : "Inactive"}</td>
            <td>${item.lastLoginAt ? adminDate(item.lastLoginAt) : "Never"}</td>
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

function apiKeyForm(values: { name?: string; permissions?: string[]; expiresAt?: string } = {}) {
  const selected = new Set(values.permissions ?? []);
  return `<form method="post" action="${config.controlPanelPath}/api-keys" class="form-grid">
    <label><span data-i18n="Key name">Key name</span><input name="name" maxlength="100" required value="${escapeHtml(values.name ?? "")}" placeholder="Deployment integration" /></label>
    <label><span data-i18n="Expires at">Expires at</span><input type="datetime-local" name="expiresAt" value="${escapeHtml(values.expiresAt ?? "")}" /><span class="meta" data-i18n="Leave blank for no expiration">Leave blank for no expiration</span></label>
    <fieldset class="editor-section"><legend data-i18n="API permissions">API permissions</legend><p class="meta" data-i18n="Grant only the permissions required by this integration.">Grant only the permissions required by this integration.</p><div class="check-grid">${apiKeyScopeOptions.map((scope) => `<label><input type="checkbox" name="permissions" value="${scope.permission}" ${selected.has(scope.permission) ? "checked" : ""} /> <span data-i18n="${scope.label}">${scope.label}</span></label>`).join("")}</div></fieldset>
    <button class="button button-primary" type="submit" data-i18n="Create API key">Create API key</button>
  </form>`;
}

adminRoutes.get("/api-keys", async (c) => {
  const user = c.get("sessionUser");
  if (!user) return c.redirect("/login");
  const keys = await listApiKeys(user.id);
  const body = `${queryNotice(c)}
    <section class="editor-section"><h1 data-i18n="API keys">API keys</h1><p class="meta" data-i18n="Create scoped credentials for server-to-server CMS API access. API keys inherit the active permissions of your user account and can only narrow them.">Create scoped credentials for server-to-server CMS API access. API keys inherit the active permissions of your user account and can only narrow them.</p>${apiKeyForm()}</section>
    <section class="editor-section"><h2 data-i18n="Active API keys">Active API keys</h2><table><thead><tr><th data-i18n="Name">Name</th><th data-i18n="Key prefix">Key prefix</th><th data-i18n="API permissions">API permissions</th><th data-i18n="Last used">Last used</th><th data-i18n="Expires at">Expires at</th><th data-i18n="Actions">Actions</th></tr></thead><tbody>${keys.map((key) => `<tr><td>${escapeHtml(key.name)}</td><td><code>${escapeHtml(`hsc_${key.keyPrefix}_...`)}</code></td><td class="cell-long">${key.permissions.map((permission) => `<code>${escapeHtml(permission)}</code>`).join(" ")}</td><td>${key.lastUsedAt ? adminDate(key.lastUsedAt) : "-"}</td><td>${key.expiresAt ? adminDate(key.expiresAt) : "-"}</td><td><form method="post" action="${config.controlPanelPath}/api-keys/${key.id}/revoke"><button class="button" type="submit" data-i18n="Revoke">Revoke</button></form></td></tr>`).join("") || `<tr><td colspan="6" data-i18n="No API keys created.">No API keys created.</td></tr>`}</tbody></table></section>`;
  return c.html(adminLayout("API keys", user, body, "wide-list"));
});

adminRoutes.post("/api-keys", async (c) => {
  const user = c.get("sessionUser");
  if (!user) return c.redirect("/login");
  const form = await c.req.formData();
  const values = {
    name: String(form.get("name") ?? ""),
    permissions: form.getAll("permissions").map(String),
    expiresAt: String(form.get("expiresAt") ?? ""),
  };
  try {
    const created = await createApiKey(user.id, values);
    await writeAuditLog({ actorUserId: user.id, action: "api_key.create", targetType: "api_key", targetId: created.record.id, summary: `Created API key "${created.record.name}".`, ipAddress: requestIp(c) });
    const body = `<section class="editor-section"><h1 data-i18n="Copy this API key now">Copy this API key now</h1><p class="meta" data-i18n="It is shown only once and cannot be recovered later.">It is shown only once and cannot be recovered later.</p><code style="display:block; overflow-wrap:anywhere; padding:12px; background:var(--line-light);">${escapeHtml(created.token)}</code><p style="margin-top:16px;"><a class="button button-primary" href="${config.controlPanelPath}/api-keys" data-i18n="Back to API keys">Back to API keys</a></p></section>`;
    return c.html(adminLayout("API keys", user, body), 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create API key.";
    return c.html(adminLayout("API keys", user, noticeCard(message, "error") + apiKeyForm(values)), 400);
  }
});

adminRoutes.post("/api-keys/:id/revoke", async (c) => {
  const user = c.get("sessionUser");
  if (!user) return c.redirect("/login");
  const id = Number(c.req.param("id"));
  if (!Number.isSafeInteger(id) || !(await revokeApiKey(id, user.id))) return c.redirect(`${config.controlPanelPath}/api-keys?error=${encodeURIComponent("API key was not found or already revoked.")}`);
  await writeAuditLog({ actorUserId: user.id, action: "api_key.revoke", targetType: "api_key", targetId: id, summary: `Revoked API key #${id}.`, ipAddress: requestIp(c) });
  return c.redirect(`${config.controlPanelPath}/api-keys?success=${encodeURIComponent("API key revoked.")}`);
});

adminRoutes.get("/database", async (c) => {
  const user = c.get("sessionUser");
  if (!user) return c.redirect("/login");
  const health = await getDatabaseHealth();
  const retention = (days: number) => days > 0 ? `${days} days` : "Disabled";
  const body = `${queryNotice(c)}
    <section class="editor-section"><div class="section-heading-row"><div><p class="editor-section-kicker" data-i18n="Operations">Operations</p><h1 class="editor-section-title" data-i18n="Database health">Database health</h1></div><span class="badge">PostgreSQL</span></div><p class="meta" data-i18n="Review database capacity, active work, and automatic retention without exposing SQL text or application data.">Review database capacity, active work, and automatic retention without exposing SQL text or application data.</p><div class="stats"><div class="stat"><p class="meta" data-i18n="Database size">Database size</p><h2>${formatByteSize(health.databaseSizeBytes)}</h2></div><div class="stat"><p class="meta" data-i18n="Connections">Connections</p><h2>${health.activeConnections} / ${health.maxConnections}</h2></div><div class="stat"><p class="meta" data-i18n="Slow active queries">Slow active queries</p><h2>${health.slowActiveQueries}</h2></div><div class="stat"><p class="meta" data-i18n="Longest transaction">Longest transaction</p><h2>${health.longestTransactionSeconds == null ? "-" : `${Math.round(health.longestTransactionSeconds)}s`}</h2></div></div><p class="meta" style="margin-top:16px;">${escapeHtml(health.version)}</p></section>
    <section class="editor-section"><h2 data-i18n="Retention policy">Retention policy</h2><p class="meta" data-i18n="Zero means automatic deletion is disabled. Changes are configured with environment variables and applied by scheduled housekeeping.">Zero means automatic deletion is disabled. Changes are configured with environment variables and applied by scheduled housekeeping.</p><table><thead><tr><th data-i18n="Data">Data</th><th data-i18n="Retention">Retention</th></tr></thead><tbody><tr><td data-i18n="Audit logs">Audit logs</td><td>${retention(health.retention.auditLogDays)}</td></tr><tr><td data-i18n="Read notifications">Read notifications</td><td>${retention(health.retention.readNotificationDays)}</td></tr></tbody></table></section>
    <section class="editor-section"><h2 data-i18n="Table statistics">Table statistics</h2><table><thead><tr><th data-i18n="Table">Table</th><th data-i18n="Estimated live rows">Estimated live rows</th><th data-i18n="Estimated dead rows">Estimated dead rows</th></tr></thead><tbody>${health.tables.map((table) => `<tr><td><code>${escapeHtml(table.name)}</code></td><td>${table.liveRows.toLocaleString()}</td><td>${table.deadRows.toLocaleString()}</td></tr>`).join("") || `<tr><td colspan="3" data-i18n="No table statistics available.">No table statistics available.</td></tr>`}</tbody></table></section>
    <section class="editor-section"><h2 data-i18n="Maintenance">Maintenance</h2><p class="meta" data-i18n="ANALYZE refreshes PostgreSQL planner statistics without changing content. Schedule VACUUM through your database platform for larger installations.">ANALYZE refreshes PostgreSQL planner statistics without changing content. Schedule VACUUM through your database platform for larger installations.</p><form method="post" action="${config.controlPanelPath}/database/analyze"><label><input type="checkbox" name="confirm" value="yes" required /> <span data-i18n="I understand that ANALYZE uses database resources.">I understand that ANALYZE uses database resources.</span></label><p style="margin-top:12px;"><button class="button" type="submit" data-i18n="Run ANALYZE">Run ANALYZE</button></p></form></section>`;
  return c.html(adminLayout("Database health", user, body, "wide-list"));
});

adminRoutes.post("/database/analyze", async (c) => {
  const user = c.get("sessionUser");
  if (!user) return c.redirect("/login");
  const form = await c.req.formData();
  if (form.get("confirm") !== "yes") return c.redirect(`${config.controlPanelPath}/database?error=${encodeURIComponent("Confirm database maintenance before continuing.")}`);
  try {
    await runDatabaseAnalyze();
    await writeAuditLog({ actorUserId: user.id, action: "database.analyze", targetType: "database", summary: "Refreshed PostgreSQL planner statistics with ANALYZE.", ipAddress: requestIp(c) });
    return c.redirect(`${config.controlPanelPath}/database?success=${encodeURIComponent("Database statistics refreshed.")}`);
  } catch (error) {
    return c.redirect(`${config.controlPanelPath}/database?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to run ANALYZE.")}`);
  }
});

adminRoutes.get("/metrics", async (c) => {
  const user = c.get("sessionUser");
  if (!user) return c.redirect("/login");
  const requestedHours = Number(c.req.query("hours") ?? 24);
  const metrics = await getOperationalMetrics([24, 168, 720].includes(requestedHours) ? requestedHours : 24);
  const labels: Record<(typeof operationalMetricNames)[number], string> = {
    "http.public_request": "Public requests",
    "http.public_4xx": "Public 4xx responses",
    "http.public_5xx": "Public 5xx responses",
    "publishing.completed": "Public regenerations",
    "form.submitted": "Form submissions",
    "media.changed": "Media changes",
    "backup.created": "Backups created",
  };
  const body = `${queryNotice(c)}
    <section class="editor-section"><div class="section-heading-row"><div><p class="editor-section-kicker" data-i18n="Operations">Operations</p><h1 class="editor-section-title" data-i18n="Operational metrics">Operational metrics</h1></div><form method="get" action="${config.controlPanelPath}/metrics"><select name="hours" aria-label="Metric window"><option value="24" ${metrics.hours === 24 ? "selected" : ""}>24 hours</option><option value="168" ${metrics.hours === 168 ? "selected" : ""}>7 days</option><option value="720" ${metrics.hours === 720 ? "selected" : ""}>30 days</option></select><button class="button" type="submit" data-i18n="Update">Update</button></form></div><p class="meta" data-i18n="Hourly aggregate counts only. No IP addresses, visitor identifiers, URLs, search terms, or form values are stored.">Hourly aggregate counts only. No IP addresses, visitor identifiers, URLs, search terms, or form values are stored.</p><div class="stats">${operationalMetricNames.map((metric) => `<div class="stat"><p class="meta" data-i18n="${labels[metric]}">${labels[metric]}</p><h2>${metrics.totals[metric].toLocaleString()}</h2></div>`).join("")}</div></section>
    <section class="editor-section"><h2 data-i18n="Hourly activity">Hourly activity</h2><table><thead><tr><th data-i18n="Hour">Hour</th><th data-i18n="Metric">Metric</th><th data-i18n="Count">Count</th></tr></thead><tbody>${metrics.rows.map((row) => `<tr><td>${adminDate(row.bucketStart)}</td><td data-i18n="${labels[row.metric as keyof typeof labels] ?? row.metric}">${labels[row.metric as keyof typeof labels] ?? escapeHtml(row.metric)}</td><td>${row.value.toLocaleString()}</td></tr>`).join("") || `<tr><td colspan="3" data-i18n="No metrics collected yet.">No metrics collected yet.</td></tr>`}</tbody></table></section>`;
  return c.html(adminLayout("Operational metrics", user, body, "wide-list"));
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
    ${target.twoFactorEnabled && target.id !== actor?.id ? `
      <form method="post" action="${config.controlPanelPath}/users/${target.id}/reset-2fa" class="security-danger-zone" style="margin-top:16px;">
        <p class="meta">Use only after verifying the user's identity. This removes personal 2FA and signs out every session.</p>
        <button class="button" type="submit">Reset two-factor authentication</button>
      </form>` : ""}
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

adminRoutes.post("/users/:id/reset-2fa", async (c) => {
  const actor = c.get("sessionUser");
  if (!actor) return c.redirect("/login");
  const target = await getUserById(Number(c.req.param("id")));
  if (!target) return c.notFound();
  if (target.id === actor.id) {
    return c.redirect(`${config.controlPanelPath}/security?error=${encodeURIComponent("Use account security to change your own two-factor authentication.")}`);
  }
  if (target.roles.includes("owner") && !actor.roles.includes("owner")) return c.text("Forbidden", 403);
  await resetUserTwoFactor(target.id);
  await writeAuditLog({ actorUserId: actor.id, action: "user.2fa_reset", targetType: "user", targetId: target.id, summary: `Reset personal two-factor authentication for user "${target.email}" and revoked sessions.`, ipAddress: requestIp(c) });
  return c.redirect(`${config.controlPanelPath}/users/${target.id}/edit?success=${encodeURIComponent("Two-factor authentication reset and sessions revoked.")}`);
});

adminRoutes.get("/", async (c) => {
  const user = c.get("sessionUser");
  const stats = await getDashboardStats();
  const recent = await listPosts({ page: 1, limit: 8, status: "any" });
  const notifications = await listOperatorNotifications(8, true);

  const body = `
    ${queryNotice(c)}
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
        ${notifications.map((notification) => `<div style="padding:12px 0; border-bottom:1px solid rgba(31,41,51,0.12);"><p style="margin:0 0 6px;">${escapeHtml(notification.message)}</p><p class="meta">${adminDate(notification.createdAt)} · ${escapeHtml(notification.action)}</p><form method="post" action="${config.controlPanelPath}/notifications/${notification.id}/read"><button class="button" type="submit">Mark as read</button></form></div>`).join("") || "<p class='meta'>No unread notifications.</p>"}
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
                    <td>${adminDate(post.updatedAt)}</td>
                  </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </article>
      <aside>
        <h2>Publishing model</h2>
        <p>Published posts regenerate static fragments, RSS, sitemap, and the embeddable script output.</p>
        <form method="post" action="${config.controlPanelPath}/render" style="margin-bottom:12px;">
          <button class="button button-primary" type="submit">Regenerate public output</button>
        </form>
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

adminRoutes.get("/settings/permalinks", async (c) => {
  const current = await getPostPermalinkPattern();
  return c.html(adminLayout("Permalink Settings", c.get("sessionUser"), permalinkSettingsForm(current, queryNotice(c))));
});

adminRoutes.post("/settings/permalinks", async (c) => {
  const user = c.get("sessionUser");
  if (!user) return c.redirect("/login");
  const requested = String((await c.req.formData()).get("pattern") ?? "");
  const previous = await getPostPermalinkPattern();
  if (!isPostPermalinkPattern(requested)) {
    return c.html(adminLayout("Permalink Settings", user, permalinkSettingsForm(previous, noticeCard("Select a valid permalink structure.", "error"))), 400);
  }
  try {
    await setPostPermalinkPattern(requested);
    await renderPublishedArtifacts();
  } catch (error) {
    await setPostPermalinkPattern(previous);
    await renderPublishedArtifacts().catch(() => undefined);
    const message = error instanceof Error ? error.message : "Unable to update permalink structure.";
    return c.html(adminLayout("Permalink Settings", user, permalinkSettingsForm(previous, noticeCard(message, "error"))), 500);
  }
  let redirectCount = 0;
  try {
    redirectCount = await createPermalinkPatternRedirects(previous, requested, user.id);
  } catch (error) {
    logError("redirect.permalink_sync_failed", "Permalink settings changed but automatic redirects could not be created.", { error, previous, requested });
  }
  await writeAuditLog({
    actorUserId: user.id,
    action: "settings.permalink_update",
    targetType: "setting",
    targetId: null,
    summary: `Changed post permalink structure from "${previous}" to "${requested}", regenerated public artifacts, and created ${redirectCount} redirects.`,
    ipAddress: requestIp(c),
  });
  return c.redirect(`${config.controlPanelPath}/settings/permalinks?success=${encodeURIComponent("Permalink structure saved and public pages regenerated.")}`);
});

adminRoutes.get("/settings/theme", async (c) => {
  return c.html(adminLayout("Theme Settings", c.get("sessionUser"), themeSettingsForm(await getPublicThemeSettings(config.googleFontsCssUrls), queryNotice(c)), "wide-list"));
});

adminRoutes.post("/settings/theme", async (c) => {
  const user = c.get("sessionUser");
  if (!user) return c.redirect("/login");
  const form = await c.req.formData();
  const previous = await getPublicThemeSettings(config.googleFontsCssUrls);
  try {
    const requested = form.get("intent") === "reset" ? { ...defaultPublicThemeSettings(config.googleFontsCssUrls), fontDeliveryMode: previous.fontDeliveryMode, localFontFaces: previous.localFontFaces } : validatePublicThemeSettings({
      kitId: form.get("kitId"),
      backgroundColor: form.get("backgroundColor"), surfaceColor: form.get("surfaceColor"), textColor: form.get("textColor"), mutedColor: form.get("mutedColor"), borderColor: form.get("borderColor"), accentColor: form.get("accentColor"),
      bodyFont: form.get("bodyFont"), headingFont: form.get("headingFont"), monoFont: form.get("monoFont"), googleFontsCssUrls: form.get("googleFontsCssUrls"),
      fontDeliveryMode: previous.fontDeliveryMode, localFontFaces: previous.localFontFaces,
      contentWidth: form.get("contentWidth"), spacingUnit: form.get("spacingUnit"), bodyFontSize: form.get("bodyFontSize"), lineHeight: form.get("lineHeight"), cornerRadius: form.get("cornerRadius"),
    });
    await setPublicThemeSettings(requested);
    try { await renderPublishedArtifacts(); } catch (error) {
      await setPublicThemeSettings(previous); await renderPublishedArtifacts().catch(() => undefined); throw error;
    }
    await writeAuditLog({ actorUserId: user.id, action: "settings.theme_update", targetType: "setting", summary: form.get("intent") === "reset" ? "Restored the default public theme and regenerated public artifacts." : "Updated the public theme and regenerated public artifacts.", ipAddress: requestIp(c) });
    return c.redirect(`${config.controlPanelPath}/settings/theme?success=${encodeURIComponent(form.get("intent") === "reset" ? "Default theme restored and public pages regenerated." : "Theme saved and public pages regenerated.")}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update theme settings.";
    return c.html(adminLayout("Theme Settings", user, themeSettingsForm(previous, noticeCard(message, "error")), "wide-list"), error instanceof AppValidationError ? 400 : 500);
  }
});

adminRoutes.post("/settings/theme/starter", async (c) => {
  const user = c.get("sessionUser");
  if (!user) return c.redirect("/login");
  const form = await c.req.formData();
  const kitId = form.get("kitId");
  const previous = await getPublicThemeSettings(config.googleFontsCssUrls);
  if (!isPublicThemeKitId(kitId)) return c.html(adminLayout("Theme Settings", user, themeSettingsForm(previous, noticeCard("Select a valid theme starter kit.", "error")), "wide-list"), 400);
  const requested = themeSettingsForKit(kitId, previous.googleFontsCssUrls, { fontDeliveryMode: previous.fontDeliveryMode, localFontFaces: previous.localFontFaces });
  try {
    await setPublicThemeSettings(requested);
    try { await renderPublishedArtifacts(); } catch (error) {
      await setPublicThemeSettings(previous); await renderPublishedArtifacts().catch(() => undefined); throw error;
    }
    await writeAuditLog({ actorUserId: user.id, action: "settings.theme_starter_apply", targetType: "setting", summary: `Applied the ${kitId} theme starter kit and regenerated public artifacts.`, ipAddress: requestIp(c) });
    return c.redirect(`${config.controlPanelPath}/settings/theme?success=${encodeURIComponent("Theme starter kit applied and public pages regenerated.")}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to apply theme starter kit.";
    return c.html(adminLayout("Theme Settings", user, themeSettingsForm(previous, noticeCard(message, "error")), "wide-list"), 500);
  }
});

adminRoutes.get("/settings/fonts", async (c) => {
  const [theme, files] = await Promise.all([getPublicThemeSettings(config.googleFontsCssUrls), listLocalFontFiles()]);
  return c.html(adminLayout("Local Fonts", c.get("sessionUser"), localFontsPage(theme, files, queryNotice(c)), "wide-list"));
});

adminRoutes.post("/settings/fonts", async (c) => {
  const user = c.get("sessionUser");
  if (!user) return c.redirect("/login");
  const form = await c.req.formData();
  const previous = await getPublicThemeSettings(config.googleFontsCssUrls);
  try {
    const mode = String(form.get("fontDeliveryMode") ?? "");
    if (!fontDeliveryModes.includes(mode as (typeof fontDeliveryModes)[number])) throw new AppValidationError("Select a valid font delivery mode.");
    const files = await listLocalFontFiles();
    const available = new Set(files.map((file) => file.name));
    const enabled = new Set(form.getAll("fontEnabled").map(String));
    const requestedFaces = [...enabled].map((file) => {
      if (!available.has(file)) throw new AppValidationError("The selected local font no longer exists.");
      return { file, family: String(form.get(`fontFamily:${file}`) ?? ""), weight: String(form.get(`fontWeight:${file}`) ?? ""), style: String(form.get(`fontStyle:${file}`) ?? "") };
    });
    const requested = { ...previous, fontDeliveryMode: mode as (typeof fontDeliveryModes)[number], localFontFaces: normalizeLocalFontFaces(requestedFaces, true) };
    await setPublicThemeSettings(requested);
    try { await renderPublishedArtifacts(); } catch (error) { await setPublicThemeSettings(previous); await renderPublishedArtifacts().catch(() => undefined); throw error; }
    await writeAuditLog({ actorUserId: user.id, action: "settings.fonts_update", targetType: "setting", summary: `Updated font delivery mode to ${mode} with ${requested.localFontFaces.length} local font faces.`, ipAddress: requestIp(c) });
    return c.redirect(`${config.controlPanelPath}/settings/fonts?success=${encodeURIComponent("Font settings saved and public pages regenerated.")}`);
  } catch (error) {
    const files = await listLocalFontFiles();
    const message = error instanceof Error ? error.message : "Unable to update font settings.";
    return c.html(adminLayout("Local Fonts", user, localFontsPage(previous, files, noticeCard(message, "error")), "wide-list"), error instanceof AppValidationError ? 400 : 500);
  }
});

adminRoutes.post("/settings/fonts/upload", async (c) => {
  const user = c.get("sessionUser");
  if (!user) return c.redirect("/login");
  try {
    const file = (await c.req.formData()).get("font");
    if (!(file instanceof File)) throw new AppValidationError("A font file is required.");
    const name = await uploadLocalFont(file);
    await writeAuditLog({ actorUserId: user.id, action: "settings.font_upload", targetType: "public_asset", targetId: name, summary: `Uploaded local font file "${name}".`, ipAddress: requestIp(c) });
    return c.redirect(`${config.controlPanelPath}/settings/fonts?success=${encodeURIComponent("Font file uploaded. Register it before use.")}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upload font file.";
    return c.redirect(`${config.controlPanelPath}/settings/fonts?error=${encodeURIComponent(message)}`);
  }
});

adminRoutes.post("/settings/fonts/delete", async (c) => {
  const user = c.get("sessionUser");
  if (!user) return c.redirect("/login");
  const file = String((await c.req.formData()).get("file") ?? "");
  const theme = await getPublicThemeSettings(config.googleFontsCssUrls);
  if (theme.localFontFaces.some((face) => face.file === file)) return c.redirect(`${config.controlPanelPath}/settings/fonts?error=${encodeURIComponent("Remove this font face before deleting the file.")}`);
  try {
    await deleteLocalFont(file);
    await writeAuditLog({ actorUserId: user.id, action: "settings.font_delete", targetType: "public_asset", targetId: file, summary: `Deleted local font file "${file}".`, ipAddress: requestIp(c) });
    return c.redirect(`${config.controlPanelPath}/settings/fonts?success=${encodeURIComponent("Font file deleted.")}`);
  } catch (error) {
    return c.redirect(`${config.controlPanelPath}/settings/fonts?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to delete font file.")}`);
  }
});

adminRoutes.get("/posts", async (c) => {
  const user = c.get("sessionUser");
  const q = c.req.query("q") ?? "";
  const status = c.req.query("status") ?? "any";
  const workflow = c.req.query("workflow") ?? "any";
  const category = c.req.query("category") ?? "";
  const locale = c.req.query("locale") ?? "any";
  const posts = await listPosts({ page: 1, limit: 50, status, workflow, category: category || undefined, search: q || undefined, locale: locale === "any" ? undefined : locale });
  const series = await listSeries();
  const permalinkPattern = await getPostPermalinkPattern();
  const seriesById = new Map(series.map((item) => [item.id, item.title]));
  const postSeriesIds = await listPostSeriesAssignments(posts.items.map((post) => post.id));
  const body = `<div class="content-list-page">
    ${queryNotice(c)}
    <div class="row" style="margin-bottom:16px;">
      <a class="button button-primary" href="${config.controlPanelPath}/posts/new">New post</a>
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
        <select name="workflow" aria-label="Review state">
          <option value="any" ${workflow === "any" ? "selected" : ""}>Any review state</option>
          <option value="draft" ${workflow === "draft" ? "selected" : ""}>Review draft</option>
          <option value="in_review" ${workflow === "in_review" ? "selected" : ""}>In review</option>
          <option value="changes_requested" ${workflow === "changes_requested" ? "selected" : ""}>Changes requested</option>
          <option value="approved" ${workflow === "approved" ? "selected" : ""}>Approved</option>
        </select>
        <input name="category" value="${escapeHtml(category)}" placeholder="Category slug" />
        <select name="locale"><option value="any">All languages</option>${contentLocales.map((item) => `<option value="${item}" ${locale === item ? "selected" : ""}>${localeLabels[item]}</option>`).join("")}</select>
        <button class="button" type="submit">Filter</button>
      </div>
    </form>
    <table class="data-table">
      <thead><tr><th>Title</th><th>Language</th><th>Status</th><th>Review state</th><th>Series</th><th>Comments</th><th>Categories</th><th>Generated page</th><th>Updated</th><th>Actions</th></tr></thead>
      <tbody>
        ${posts.items
          .map(
            (post) => `
              <tr>
                <td class="cell-long"><a href="${config.controlPanelPath}/posts/${post.id}/edit">${escapeHtml(post.title)}</a></td>
                <td>${escapeHtml(localeLabels[post.locale])}</td>
                <td>${escapeHtml(post.status)}</td>
                <td>${workflowBadge(post.workflowState)}</td>
                <td>${escapeHtml(seriesById.get(postSeriesIds.get(post.id) ?? 0) ?? "No series")}</td>
                <td><form method="post" action="${config.controlPanelPath}/posts/${post.id}/comments-policy" class="row"><select name="commentsPolicy" aria-label="Comment setting"><option value="inherit" ${post.commentsPolicy === "inherit" ? "selected" : ""}>Inherit series setting</option><option value="enabled" ${post.commentsPolicy === "enabled" ? "selected" : ""}>Allow comments</option><option value="disabled" ${post.commentsPolicy === "disabled" ? "selected" : ""}>Disallow comments</option></select><button class="button" type="submit">Save</button></form><span class="meta">${post.commentsEnabled ? "Comments enabled" : "Comments disabled"}</span></td>
                <td class="cell-long">${escapeHtml(post.categories.join(", "))}</td>
                <td class="cell-long">${post.status === "published"
                  ? `<a href="${escapeHtml(postPermalinkPath(post, permalinkPattern))}" target="_blank" rel="noopener noreferrer">Open generated page <span aria-hidden="true">↗</span></a><br /><code>${escapeHtml(postPermalinkPath(post, permalinkPattern))}</code>`
                  : `<span class="meta">Not generated</span>`}</td>
                <td>${adminDate(post.updatedAt)}</td>
                <td class="cell-actions">
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
  </div>`;

  return c.html(adminLayout("Posts", user, body, "wide-list"));
});

adminRoutes.post("/posts/:id/comments-policy", async (c) => {
  const form = await c.req.formData();
  const policy = String(form.get("commentsPolicy") ?? "inherit") as "inherit" | "enabled" | "disabled";
  try {
    await setPostCommentsPolicy(Number(c.req.param("id")), policy);
  } catch (error) {
    if (error instanceof AppValidationError) return c.redirect(`${config.controlPanelPath}/posts?error=${encodeURIComponent(error.message)}`);
    throw error;
  }
  await renderPublishedArtifacts();
  await writeAuditLog({ actorUserId: c.get("sessionUser")?.id ?? null, action: "post.comments_policy", targetType: "post", targetId: c.req.param("id"), summary: `Changed comment policy for post #${c.req.param("id")} to ${policy}.`, ipAddress: requestIp(c) });
  return c.redirect(`${config.controlPanelPath}/posts?success=${encodeURIComponent("Comment setting saved.")}`);
});

adminRoutes.get("/comments", async (c) => {
  const status = c.req.query("status") === "approved" ? "approved" : c.req.query("status") === "pending" ? "pending" : "any";
  const comments = await listComments(status);
  const body = `${queryNotice(c)}<form method="get" action="${config.controlPanelPath}/comments" class="row" style="margin-bottom:20px"><label>Status<select name="status"><option value="any" ${status === "any" ? "selected" : ""}>Any status</option><option value="pending" ${status === "pending" ? "selected" : ""}>Pending</option><option value="approved" ${status === "approved" ? "selected" : ""}>Approved</option></select></label><button class="button" type="submit">Filter</button></form><table><thead><tr><th>Article</th><th>Author</th><th>Comment</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody>${comments.map((comment) => `<tr><td class="cell-long">${escapeHtml(comment.postTitle)}</td><td class="cell-long"><strong>${escapeHtml(comment.authorName)}</strong><br><span class="meta">${escapeHtml(comment.authorEmail)}</span></td><td class="cell-long">${escapeHtml(comment.body)}</td><td>${escapeHtml(comment.status)}</td><td>${adminDate(comment.createdAt)}</td><td class="cell-actions"><div class="row">${comment.status === "pending" ? `<form method="post" action="${config.controlPanelPath}/comments/${comment.id}/approve"><button class="button button-primary" type="submit">Approve</button></form>` : ""}<form method="post" action="${config.controlPanelPath}/comments/${comment.id}/delete"><button class="button" type="submit">Delete</button></form></div></td></tr>`).join("") || `<tr><td colspan="6">No comments found.</td></tr>`}</tbody></table>`;
  return c.html(adminLayout("Comments", c.get("sessionUser"), body));
});

adminRoutes.post("/comments/:id/approve", async (c) => {
  const user = c.get("sessionUser");
  if (!user) return c.redirect("/login");
  await approveComment(Number(c.req.param("id")), user.id);
  await renderPublishedArtifacts();
  await writeAuditLog({ actorUserId: user.id, action: "comment.approve", targetType: "post_comment", targetId: c.req.param("id"), summary: `Approved comment #${c.req.param("id")}.`, ipAddress: requestIp(c) });
  return c.redirect(`${config.controlPanelPath}/comments?success=${encodeURIComponent("Comment approved.")}`);
});

adminRoutes.post("/comments/:id/delete", async (c) => {
  const user = c.get("sessionUser");
  await deleteComment(Number(c.req.param("id")));
  await renderPublishedArtifacts();
  await writeAuditLog({ actorUserId: user?.id ?? null, action: "comment.delete", targetType: "post_comment", targetId: c.req.param("id"), summary: `Deleted comment #${c.req.param("id")}.`, ipAddress: requestIp(c) });
  return c.redirect(`${config.controlPanelPath}/comments?success=${encodeURIComponent("Comment deleted.")}`);
});

adminRoutes.get("/posts/new", async (c) => {
  const user = c.get("sessionUser");
  return c.html(adminLayout("New Post", user, queryNotice(c) + postForm(`${config.controlPanelPath}/posts`, {
    autosaveKey: newAutosaveKey(c.req.query("autosave")),
  }, await listSeries())));
});

adminRoutes.get("/categories", async (c) => {
  const [categories, stylesheets] = await Promise.all([listCategories(), listStylesheets("categories")]);
  const body = `
    ${queryNotice(c)}
    <section class="editor-section">
      <p class="editor-section-kicker">Article presentation</p>
      <h2 class="editor-section-title">Category stylesheets</h2>
      <p class="meta">Assign CSS from <code>public_html/assets/css/categories</code>. Every published post automatically loads the stylesheets assigned to its categories.</p>
    </section>
    <table>
      <thead><tr><th>Category</th><th>Slug</th><th>Posts</th><th>Stylesheet</th><th>Actions</th></tr></thead>
      <tbody>
        ${categories.map((category) => `<tr>
          <td><strong>${escapeHtml(category.name)}</strong></td>
          <td><code>${escapeHtml(category.slug)}</code></td>
          <td>${category.postCount}</td>
          <td><code>${escapeHtml(category.stylesheetPath ?? "Default site stylesheet only")}</code></td>
          <td class="cell-actions">
            <form method="post" action="${config.controlPanelPath}/categories/${category.id}/stylesheet" class="row">
              <select name="stylesheetPath" aria-label="Stylesheet">
                <option value="">Default site stylesheet only</option>
                ${stylesheets.map((stylesheet) => `<option value="${escapeHtml(stylesheet)}" ${category.stylesheetPath === stylesheet ? "selected" : ""}>${escapeHtml(stylesheet)}</option>`).join("")}
              </select>
              <button class="button" type="submit">Save stylesheet</button>
            </form>
          </td>
        </tr>`).join("") || `<tr><td colspan="5">No categories yet. Categories are created when a post is saved.</td></tr>`}
      </tbody>
    </table>`;
  return c.html(adminLayout("Categories", c.get("sessionUser"), body, "wide-list"));
});

adminRoutes.post("/categories/:id/stylesheet", async (c) => {
  const form = await c.req.formData();
  try {
    await updateCategoryStylesheet(Number(c.req.param("id")), String(form.get("stylesheetPath") ?? ""));
    await renderPublishedArtifacts();
  } catch (error) {
    if (error instanceof AppValidationError) {
      return c.redirect(`${config.controlPanelPath}/categories?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
  await writeAuditLog({
    actorUserId: c.get("sessionUser")?.id ?? null,
    action: "category.stylesheet.update",
    targetType: "category",
    targetId: c.req.param("id"),
    summary: `Updated the stylesheet for category #${c.req.param("id")}.`,
    ipAddress: requestIp(c),
  });
  return c.redirect(`${config.controlPanelPath}/categories?success=${encodeURIComponent("Category stylesheet saved.")}`);
});

adminRoutes.post("/posts", async (c) => {
  const user = c.get("sessionUser");
  if (!user) {
    return c.redirect("/login");
  }

  const form = await c.req.formData();
  const values = postValuesFromForm(form);
  const publishAndGenerate = applyPublishAndGenerateAction(form, values);
  const series = await listSeries();
  const selectedSeries = series.find((item) => item.id === Number(form.get("seriesId")));
  values.slug = buildScopedSlug(values.slug, values.title, selectedSeries?.slug);
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
        publishedAt: scheduleTimestampForStorage(values.publishedAt, config.scheduleTimeZone),
        categorySlugs: splitCsv(form.get("categories")),
        tagSlugs: splitCsv(form.get("tags")),
        seoTitle: values.seoTitle,
        seoDescription: values.seoDescription,
        seoCanonicalUrl: values.seoCanonicalUrl,
        seoOgImage: values.seoOgImage,
        seoKeywords: values.seoKeywords,
        seoNoindex: values.seoNoindex === "true",
        seoNofollow: values.seoNofollow === "true",
        seriesId: selectedSeries?.id ?? null,
        locale: values.locale as "en" | "ja" | "zh",
        translationGroup: values.translationGroup || undefined,
      },
      user.id,
    );
  } catch (error) {
    if (error instanceof AppValidationError) {
      return c.html(adminLayout("New Post", user, noticeCard(error.message, "error") + postForm(`${config.controlPanelPath}/posts`, values, series)), 400);
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
  await clearSubmittedAutosave(user.id, "post", values.autosaveKey);
  const success = publishAndGenerate ? "Post published and generated." : "Post saved.";
  return c.redirect(`${config.controlPanelPath}/posts/${post?.id ?? ""}/edit?success=${encodeURIComponent(success)}`);
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
  const series = await listSeries();
  const [seriesId, translations] = await Promise.all([
    getPostSeriesId(Number(c.req.param("id"))),
    listPosts({ page: 1, limit: 50, status: "any", translationGroup: post?.translationGroup }),
  ]);
  if (!post) {
    return c.text("Not found", 404);
  }
  const workflowEvents = await listEditorialWorkflowEvents("post", post.id);

  return c.html(
    adminLayout(
      "Edit Post",
      user,
      queryNotice(c) + `<p class="meta"><a href="/preview/post/${encodeURIComponent(post.slug)}?locale=${post.locale}&token=${encodeURIComponent(await createPreviewToken("post", post.slug, post.locale))}" target="_blank" rel="noopener noreferrer">Open 1-hour preview</a></p>` + translationPanel("posts", post, translations.items) + editorialWorkflowPanel("post", post, user, workflowEvents) + postForm(`${config.controlPanelPath}/posts/${post.id}`, {
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt ?? "",
        bodyMd: post.bodyMd ?? "",
        bodyHtml: post.bodyHtml ?? "",
        status: post.status,
        publishedAt: scheduleTimestampForInput(post.publishedAt, config.scheduleTimeZone),
        categories: post.categories.join(", "),
        tags: post.tags.join(", "),
        locale: post.locale,
        translationGroup: post.translationGroup,
        seoTitle: post.seoTitle ?? "",
        seoDescription: post.seoDescription ?? "",
        seoCanonicalUrl: post.seoCanonicalUrl ?? "",
        seoOgImage: post.seoOgImage ?? "",
        seoKeywords: post.seoKeywords ?? "",
        seoNoindex: post.seoNoindex ? "true" : "false",
        seoNofollow: post.seoNofollow ? "true" : "false",
        seriesId: seriesId ? String(seriesId) : "",
        autosaveKey: `post-${post.id}`,
        autosaveBaseUpdatedAt: post.updatedAt,
      }, series) +
        snapshotHelperCard(`${config.controlPanelPath}/posts/${post.id}/edit`, [
          "index.html",
          "assets/css/site.css",
          "cms/posts/latest.html",
        ]) +
        mediaHelperCard(mediaItems) +
        revisionLinkCard(`${config.controlPanelPath}/posts/${post.id}/revisions`),
    ),
  );
});

adminRoutes.post("/posts/:id/translations", async (c) => {
  const user = c.get("sessionUser");
  const source = await getPostById(Number(c.req.param("id")));
  const locale = String((await c.req.formData()).get("locale") ?? "");
  if (!user || !source) return c.redirect(`${config.controlPanelPath}/posts`);
  if (!contentLocales.includes(locale as (typeof contentLocales)[number])) return c.redirect(`${config.controlPanelPath}/posts/${source.id}/edit?error=${encodeURIComponent("Select a valid content language.")}`);
  const existing = await listPosts({ page: 1, limit: 1, status: "any", locale, translationGroup: source.translationGroup });
  if (existing.items[0]) return c.redirect(`${config.controlPanelPath}/posts/${existing.items[0].id}/edit`);
  const created = await createPost({
    title: source.title,
    slug: source.slug,
    excerpt: source.excerpt ?? "",
    bodyMd: source.bodyMd ?? "",
    bodyHtml: source.bodyHtml,
    status: "draft",
    categorySlugs: source.categories,
    tagSlugs: source.tags,
    locale: locale as "en" | "ja" | "zh",
    translationGroup: source.translationGroup,
  }, user.id);
  await writeAuditLog({ actorUserId: user.id, action: "post.translation.create", targetType: "post", targetId: created?.id ?? null, summary: `Created ${locale} translation draft from post #${source.id}.`, ipAddress: requestIp(c) });
  return c.redirect(`${config.controlPanelPath}/posts/${created?.id ?? source.id}/edit?success=${encodeURIComponent("Translation draft created.")}`);
});

adminRoutes.post("/posts/:id", async (c) => {
  const form = await c.req.formData();
  const user = c.get("sessionUser");
  const mediaItems = await listMedia();
  const series = await listSeries();
  const values = postValuesFromForm(form);
  const publishAndGenerate = applyPublishAndGenerateAction(form, values);
  let postUrlChange: { previous: NonNullable<Awaited<ReturnType<typeof getPostById>>>; current: NonNullable<Awaited<ReturnType<typeof getPostById>>> } | null = null;
  try {
    if (values.status !== "draft" && !hasPermission(user, "posts.publish")) throw new AppValidationError("You do not have permission to publish posts.");
    const existing = await getPostById(Number(c.req.param("id")));
    if (!existing) return c.text("Not found", 404);
    const input = {
      title: values.title,
      slug: values.slug,
      excerpt: values.excerpt,
      bodyMd: values.bodyMd,
      bodyHtml: values.bodyHtml,
      status: values.status as "draft" | "published" | "scheduled",
      publishedAt: scheduleTimestampForStorage(values.publishedAt, config.scheduleTimeZone),
      categorySlugs: splitCsv(form.get("categories")),
      tagSlugs: splitCsv(form.get("tags")),
      seoTitle: values.seoTitle,
      seoDescription: values.seoDescription,
      seoCanonicalUrl: values.seoCanonicalUrl,
      seoOgImage: values.seoOgImage,
      seoKeywords: values.seoKeywords,
      seoNoindex: values.seoNoindex === "true",
      seoNofollow: values.seoNofollow === "true",
        seriesId: Number(form.get("seriesId")) > 0 ? Number(form.get("seriesId")) : null,
      locale: values.locale as "en" | "ja" | "zh",
      translationGroup: values.translationGroup || existing.translationGroup,
    } as const;
    const updated = await updatePost(Number(c.req.param("id")), input, user?.id);
    if (updated) postUrlChange = { previous: existing, current: updated };
  } catch (error) {
    if (error instanceof AppValidationError) {
      const current = await getPostById(Number(c.req.param("id")));
      const workflowPanel = current
        ? editorialWorkflowPanel("post", current, user, await listEditorialWorkflowEvents("post", current.id))
        : "";
      return c.html(
        adminLayout(
          "Edit Post",
          user,
          noticeCard(error.message, "error") + workflowPanel +
            postForm(`${config.controlPanelPath}/posts/${c.req.param("id")}`, values, series) +
            snapshotHelperCard(`${config.controlPanelPath}/posts/${c.req.param("id")}/edit`, [
              "index.html",
              "assets/css/site.css",
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

  if (postUrlChange) {
    try {
      await syncPostUrlRedirect(postUrlChange.previous, postUrlChange.current, await getPostPermalinkPattern(), user?.id ?? null);
    } catch (error) {
      logError("redirect.post_sync_failed", "Post updated but its automatic URL redirect could not be synchronized.", { error, postId: c.req.param("id") });
    }
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
  if (user) await clearSubmittedAutosave(user.id, "post", values.autosaveKey);
  const success = publishAndGenerate ? "Post published and generated." : "Post updated.";
  return c.redirect(`${config.controlPanelPath}/posts/${c.req.param("id")}/edit?success=${encodeURIComponent(success)}`);
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
            <td>${adminDate(revision.createdAt)}</td>
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
  const job = await enqueuePublicRender();
  await writeAuditLog({
    actorUserId: c.get("sessionUser")?.id ?? null,
    action: "renderer.regenerate",
    targetType: "system",
    targetId: "cms",
    summary: `Queued public CMS artifact regeneration (job #${job.id}).`,
    ipAddress: requestIp(c),
  });
  return c.redirect(`${config.controlPanelPath}?success=${encodeURIComponent("Public page regeneration was queued and will run shortly.")}`);
});

adminRoutes.get("/pages", async (c) => {
  const user = c.get("sessionUser");
  const q = c.req.query("q") ?? "";
  const status = c.req.query("status") ?? "any";
  const workflow = c.req.query("workflow") ?? "any";
  const locale = c.req.query("locale") ?? "any";
  const pages = await listPages({ page: 1, limit: 50, status, workflow, search: q || undefined, locale: locale === "any" ? undefined : locale });
  const groups = await listPageGroups();
  const groupById = new Map(groups.map((item) => [item.id, item.title]));
  const pageGroupIds = await listPageGroupAssignments(pages.items.map((page) => page.id));
  const body = `<div class="content-list-page">
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
        <select name="workflow" aria-label="Review state">
          <option value="any" ${workflow === "any" ? "selected" : ""}>Any review state</option>
          <option value="draft" ${workflow === "draft" ? "selected" : ""}>Review draft</option>
          <option value="in_review" ${workflow === "in_review" ? "selected" : ""}>In review</option>
          <option value="changes_requested" ${workflow === "changes_requested" ? "selected" : ""}>Changes requested</option>
          <option value="approved" ${workflow === "approved" ? "selected" : ""}>Approved</option>
        </select>
        <select name="locale"><option value="any">All languages</option>${contentLocales.map((item) => `<option value="${item}" ${locale === item ? "selected" : ""}>${localeLabels[item]}</option>`).join("")}</select>
        <button class="button" type="submit">Filter</button>
      </div>
    </form>
    <table class="data-table">
      <thead><tr><th>Title</th><th>Language</th><th>Status</th><th>Review state</th><th>Page group</th><th>Updated</th><th>Actions</th></tr></thead>
      <tbody>
        ${pages.items
          .map(
            (page) => `
              <tr>
                <td class="cell-long"><a href="${config.controlPanelPath}/pages/${page.id}/edit">${escapeHtml(page.title)}</a></td>
                <td>${escapeHtml(localeLabels[page.locale])}</td>
                <td>${escapeHtml(page.status)}</td>
                <td>${workflowBadge(page.workflowState)}</td>
                <td>${escapeHtml(groupById.get(pageGroupIds.get(page.id) ?? 0) ?? "No page group")}</td>
                <td>${adminDate(page.updatedAt)}</td>
                <td class="cell-actions">
                  <div class="row">
                    <a class="button" href="${config.controlPanelPath}/pages/${page.id}/edit">Edit</a>
                    <a class="button" href="${page.locale === "en" ? "/cms" : `/cms/${page.locale}`}/pages/${page.slug}.html">View output</a>
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
  </div>`;

  return c.html(adminLayout("Pages", user, body, "wide-list"));
});

adminRoutes.get("/pages/new", async (c) => {
  const user = c.get("sessionUser");
  const [groups, stylesheets] = await Promise.all([listPageGroups(), listStylesheets("pages")]);
  return c.html(adminLayout("New Page", user, queryNotice(c) + pageForm(`${config.controlPanelPath}/pages`, {
    autosaveKey: newAutosaveKey(c.req.query("autosave")),
  }, groups, stylesheets)));
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
                <td class="cell-long"><a href="${config.controlPanelPath}/forms/${form.id}/edit">${escapeHtml(form.title)}</a></td>
                <td>${escapeHtml(form.status)}</td>
                <td>${form.fields.length}</td>
                <td class="cell-actions">
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

adminRoutes.get("/forms/:id/submissions.csv", async (c) => {
  const user = c.get("sessionUser");
  const form = await getFormById(Number(c.req.param("id")));
  if (!form) {
    return c.text("Not found", 404);
  }
  const submissions = await listFormSubmissions(form.id);
  await writeAuditLog({
    actorUserId: user?.id ?? null,
    action: "form.submissions.export",
    targetType: "form",
    targetId: form.id,
    summary: `Exported submissions for form "${form.title}".`,
    ipAddress: requestIp(c),
  });
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="${form.slug}.submissions.csv"`);
  return c.body(`\uFEFF${renderFormSubmissionsCsv(form, submissions)}`);
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
          <span class="row"><a class="button" href="/cms/forms/${form.slug}.html">Open published form</a><a class="button" href="${config.controlPanelPath}/forms/${form.id}/submissions.csv">Download CSV</a></span>
        </div>
        <table>
          <thead><tr><th>When</th><th>Payload</th></tr></thead>
          <tbody>
            ${submissions
              .map(
                (submission) => `
                  <tr>
                    <td>${adminDate(submission.createdAt)}</td>
                    <td class="cell-long"><code>${escapeHtml(JSON.stringify(submission.payload))}</code></td>
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
            <span class="row"><a class="button" href="/cms/forms/${values.slug}.html">Open published form</a><a class="button" href="${config.controlPanelPath}/forms/${c.req.param("id")}/submissions.csv">Download CSV</a></span>
          </div>
          <table>
            <thead><tr><th>When</th><th>Payload</th></tr></thead>
            <tbody>
              ${submissions
                .map(
                  (submission) => `
                    <tr>
                      <td>${adminDate(submission.createdAt)}</td>
                      <td class="cell-long"><code>${escapeHtml(JSON.stringify(submission.payload))}</code></td>
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
  const publishAndGenerate = applyPublishAndGenerateAction(form, values);
  const groups = await listPageGroups();
  const stylesheets = await listStylesheets("pages");
  const selectedGroup = groups.find((item) => item.id === Number(form.get("pageGroupId")));
  values.slug = buildScopedSlug(values.slug, values.title, selectedGroup?.slug);
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
        publishedAt: scheduleTimestampForStorage(values.publishedAt, config.scheduleTimeZone),
        seoTitle: values.seoTitle,
        seoDescription: values.seoDescription,
        seoCanonicalUrl: values.seoCanonicalUrl,
        seoOgImage: values.seoOgImage,
        seoKeywords: values.seoKeywords,
        seoNoindex: values.seoNoindex === "true",
        seoNofollow: values.seoNofollow === "true",
        pageGroupId: selectedGroup?.id ?? null,
        stylesheetPath: values.stylesheetPath,
        locale: values.locale as "en" | "ja" | "zh",
        translationGroup: values.translationGroup || undefined,
      },
      user.id,
    );
  } catch (error) {
    if (error instanceof AppValidationError) {
      return c.html(adminLayout("New Page", user, noticeCard(error.message, "error") + pageForm(`${config.controlPanelPath}/pages`, values, groups, stylesheets)), 400);
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
  await clearSubmittedAutosave(user.id, "page", values.autosaveKey);
  const success = publishAndGenerate ? "Page published and generated." : "Page saved.";
  return c.redirect(`${config.controlPanelPath}/pages/${page?.id ?? ""}/edit?success=${encodeURIComponent(success)}`);
});

adminRoutes.get("/pages/:id/edit", async (c) => {
  const user = c.get("sessionUser");
  const page = await getPageById(Number(c.req.param("id")));
  const mediaItems = await listMedia();
  const groups = await listPageGroups();
  const stylesheets = await listStylesheets("pages");
  const [groupId, translations] = await Promise.all([
    getPageGroupId(Number(c.req.param("id"))),
    listPages({ page: 1, limit: 50, status: "any", translationGroup: page?.translationGroup }),
  ]);
  if (!page) {
    return c.text("Not found", 404);
  }
  const workflowEvents = await listEditorialWorkflowEvents("page", page.id);

  return c.html(
    adminLayout(
      "Edit Page",
      user,
      queryNotice(c) + `<p class="meta"><a href="/preview/page/${encodeURIComponent(page.slug)}?locale=${page.locale}&token=${encodeURIComponent(await createPreviewToken("page", page.slug, page.locale))}" target="_blank" rel="noopener noreferrer">Open 1-hour preview</a></p>` + translationPanel("pages", page, translations.items) + editorialWorkflowPanel("page", page, user, workflowEvents) + pageForm(`${config.controlPanelPath}/pages/${page.id}`, {
        title: page.title,
        slug: page.slug,
        excerpt: page.excerpt ?? "",
        bodyMd: page.bodyMd ?? "",
        bodyHtml: page.bodyHtml ?? "",
        status: page.status,
        publishedAt: scheduleTimestampForInput(page.publishedAt, config.scheduleTimeZone),
        seoTitle: page.seoTitle ?? "",
        seoDescription: page.seoDescription ?? "",
        seoCanonicalUrl: page.seoCanonicalUrl ?? "",
        seoOgImage: page.seoOgImage ?? "",
        seoKeywords: page.seoKeywords ?? "",
        seoNoindex: page.seoNoindex ? "true" : "false",
        seoNofollow: page.seoNofollow ? "true" : "false",
        pageGroupId: groupId ? String(groupId) : "",
        stylesheetPath: page.stylesheetPath ?? "",
        locale: page.locale,
        translationGroup: page.translationGroup,
        autosaveKey: `page-${page.id}`,
        autosaveBaseUpdatedAt: page.updatedAt,
      }, groups, stylesheets) +
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

adminRoutes.post("/pages/:id/translations", async (c) => {
  const user = c.get("sessionUser");
  const source = await getPageById(Number(c.req.param("id")));
  const locale = String((await c.req.formData()).get("locale") ?? "");
  if (!user || !source) return c.redirect(`${config.controlPanelPath}/pages`);
  if (!contentLocales.includes(locale as (typeof contentLocales)[number])) return c.redirect(`${config.controlPanelPath}/pages/${source.id}/edit?error=${encodeURIComponent("Select a valid content language.")}`);
  const existing = await listPages({ page: 1, limit: 1, status: "any", locale, translationGroup: source.translationGroup });
  if (existing.items[0]) return c.redirect(`${config.controlPanelPath}/pages/${existing.items[0].id}/edit`);
  const created = await createPage({
    title: source.title,
    slug: source.slug,
    excerpt: source.excerpt ?? "",
    bodyMd: source.bodyMd ?? "",
    bodyHtml: source.bodyHtml,
    status: "draft",
    stylesheetPath: source.stylesheetPath,
    locale: locale as "en" | "ja" | "zh",
    translationGroup: source.translationGroup,
  }, user.id);
  await writeAuditLog({ actorUserId: user.id, action: "page.translation.create", targetType: "page", targetId: created?.id ?? null, summary: `Created ${locale} translation draft from page #${source.id}.`, ipAddress: requestIp(c) });
  return c.redirect(`${config.controlPanelPath}/pages/${created?.id ?? source.id}/edit?success=${encodeURIComponent("Translation draft created.")}`);
});

adminRoutes.post("/pages/:id", async (c) => {
  const form = await c.req.formData();
  const user = c.get("sessionUser");
  const mediaItems = await listMedia();
  const groups = await listPageGroups();
  const stylesheets = await listStylesheets("pages");
  const values = pageValuesFromForm(form);
  const publishAndGenerate = applyPublishAndGenerateAction(form, values);
  let pageUrlChange: { previous: NonNullable<Awaited<ReturnType<typeof getPageById>>>; current: NonNullable<Awaited<ReturnType<typeof getPageById>>> } | null = null;
  try {
    if (values.status !== "draft" && !hasPermission(user, "pages.publish")) throw new AppValidationError("You do not have permission to publish pages.");
    const existing = await getPageById(Number(c.req.param("id")));
    if (!existing) return c.text("Not found", 404);
    const input = {
      title: values.title,
      slug: values.slug,
      excerpt: values.excerpt,
      bodyMd: values.bodyMd,
      bodyHtml: values.bodyHtml,
      status: values.status as "draft" | "published" | "scheduled",
      publishedAt: scheduleTimestampForStorage(values.publishedAt, config.scheduleTimeZone),
      seoTitle: values.seoTitle,
      seoDescription: values.seoDescription,
      seoCanonicalUrl: values.seoCanonicalUrl,
      seoOgImage: values.seoOgImage,
      seoKeywords: values.seoKeywords,
      seoNoindex: values.seoNoindex === "true",
      seoNofollow: values.seoNofollow === "true",
      pageGroupId: Number(form.get("pageGroupId")) > 0 ? Number(form.get("pageGroupId")) : null,
      stylesheetPath: values.stylesheetPath,
      locale: values.locale as "en" | "ja" | "zh",
      translationGroup: values.translationGroup || existing.translationGroup,
    } as const;
    const updated = await updatePage(Number(c.req.param("id")), input, user?.id);
    if (updated) pageUrlChange = { previous: existing, current: updated };
  } catch (error) {
    if (error instanceof AppValidationError) {
      const current = await getPageById(Number(c.req.param("id")));
      const workflowPanel = current
        ? editorialWorkflowPanel("page", current, user, await listEditorialWorkflowEvents("page", current.id))
        : "";
      return c.html(
        adminLayout(
          "Edit Page",
          user,
          noticeCard(error.message, "error") + workflowPanel +
            pageForm(`${config.controlPanelPath}/pages/${c.req.param("id")}`, values, groups, stylesheets) +
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

  if (pageUrlChange) {
    try {
      await syncPageUrlRedirect(pageUrlChange.previous, pageUrlChange.current, user?.id ?? null);
    } catch (error) {
      logError("redirect.page_sync_failed", "Fixed page updated but its automatic URL redirect could not be synchronized.", { error, pageId: c.req.param("id") });
    }
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
  if (user) await clearSubmittedAutosave(user.id, "page", values.autosaveKey);
  const success = publishAndGenerate ? "Page published and generated." : "Page updated.";
  return c.redirect(`${config.controlPanelPath}/pages/${c.req.param("id")}/edit?success=${encodeURIComponent(success)}`);
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
            <td>${adminDate(revision.createdAt)}</td>
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
    stylesheetPath: snapshot.stylesheetPath,
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

adminRoutes.get("/series", async (c) => {
  const user = c.get("sessionUser");
  const series = await listSeries();
  const body = `<div class="content-list-page">${queryNotice(c)}
    <div class="row" style="justify-content:space-between; align-items:center; margin-bottom:20px;">
      <div><p class="meta">Group related articles into an ordered editorial thread.</p></div>
      <a class="button button-primary" href="${config.controlPanelPath}/series/new">New series</a>
    </div>
    <table class="data-table"><thead><tr><th>Series</th><th>Slug</th><th>Articles</th><th>Comments</th><th>Actions</th></tr></thead><tbody>
      ${series.map((item) => `<tr><td class="cell-long"><strong>${escapeHtml(item.title)}</strong><br><span class="meta">${escapeHtml(item.description ?? "")}</span></td><td><code>${escapeHtml(item.slug)}</code></td><td>${item.postCount}</td><td>${item.commentsEnabled ? "Comments enabled" : "Comments disabled"}</td><td class="cell-actions"><div class="row"><a class="button" href="${config.controlPanelPath}/series/${item.id}/edit">Manage articles</a><form method="post" action="${config.controlPanelPath}/series/${item.id}/delete"><button class="button" type="submit">Delete</button></form></div></td></tr>`).join("") || "<tr><td colspan='5'>No series yet.</td></tr>"}
    </tbody></table>
  </div>`;
  return c.html(adminLayout("Series", user, body, "wide-list"));
});

adminRoutes.get("/series/new", (c) => c.html(adminLayout("New Series", c.get("sessionUser"), `${queryNotice(c)}
  <form method="post" action="${config.controlPanelPath}/series" class="editor-form form-grid">
    <section class="editor-section">
      <p class="editor-section-kicker">Organization</p>
      <h2 class="editor-section-title">Series information</h2>
      <p class="meta">Create the parent collection first, then add and order its articles.</p>
      <div class="form-grid">
        <label>Series title <input name="title" required placeholder="e.g. CMS development diary" /></label>
        <label>Slug <input name="slug" required placeholder="cms-development-diary" /></label>
        <label>Description <textarea name="description"></textarea></label>
      </div>
    </section>
    <section class="editor-section editor-section-compact">
      <p class="editor-section-kicker">Discussion</p>
      <h2 class="editor-section-title">Comment policy</h2>
      <label class="checkbox-label"><input type="checkbox" name="commentsEnabled" value="true" /> <span>Enable comments for this series</span></label>
      <p class="meta">Individual articles can still disable comments after the series is created.</p>
    </section>
    <div class="row"><button class="button button-primary" type="submit">Create series</button></div>
  </form>`)));

adminRoutes.post("/series", async (c) => {
  const form = await c.req.formData();
  try {
    const item = await createSeries({ title: String(form.get("title") ?? ""), slug: String(form.get("slug") ?? ""), description: String(form.get("description") ?? ""), commentsEnabled: form.has("commentsEnabled") });
    return c.redirect(`${config.controlPanelPath}/series/${item?.id ?? ""}/edit?success=${encodeURIComponent("Series created.")}`);
  } catch (error) {
    if (error instanceof AppValidationError) return c.html(adminLayout("New Series", c.get("sessionUser"), noticeCard(error.message, "error")), 400);
    throw error;
  }
});

adminRoutes.get("/series/:id/edit", async (c) => {
  const user = c.get("sessionUser");
  const item = await getSeriesById(Number(c.req.param("id")));
  if (!item) return c.text("Not found", 404);
  const posts = await listPosts({ page: 1, limit: 50, status: "any" });
  const members = await listSeriesPosts(item.id);
  const memberIds = new Set(members.map((post) => Number(post.id)));
  const body = `${queryNotice(c)}
    <div class="editor-form group-editor">
    <section class="editor-section">
      <p class="editor-section-kicker">Organization</p>
      <h2 class="editor-section-title">Series information</h2>
      <p class="meta">This parent controls the shared URL scope, description, and default comment policy.</p>
      <form method="post" action="${config.controlPanelPath}/series/${item.id}" class="form-grid">
        <label>Series title <input name="title" value="${escapeHtml(item.title)}" required /></label>
        <label>Slug <input name="slug" value="${escapeHtml(item.slug)}" required /></label>
        <label>Description <textarea name="description">${escapeHtml(item.description ?? "")}</textarea></label>
        <details class="editor-inline-details">
          <summary><span class="editor-section-title">Comment policy</span></summary>
          <label class="checkbox-label"><input type="checkbox" name="commentsEnabled" value="true" ${item.commentsEnabled ? "checked" : ""} /> <span>Enable comments for this series</span></label>
          <p class="meta">Turning this off closes comments on every article in the series. When enabled, individual articles can still disallow comments from the post list.</p>
        </details>
        <button class="button button-primary" type="submit">Save series</button>
      </form>
    </section>
    <section class="editor-section">
      <p class="editor-section-kicker">Series contents</p>
      <div class="section-heading-row"><div><h2 class="editor-section-title">Series articles</h2><p class="meta">${members.length} articles in ${escapeHtml(item.title)}</p></div></div>
      <form method="post" action="${config.controlPanelPath}/series/${item.id}/posts" class="assignment-form">
        <label>Add article<select name="postId"><option value="">Select an article</option>${posts.items.filter((post) => !memberIds.has(post.id)).map((post) => `<option value="${post.id}">${escapeHtml(post.title)}</option>`).join("")}</select></label>
        <label class="assignment-order">Order<input type="number" name="position" min="0" value="${members.length}" /></label>
        <button class="button button-primary" type="submit">Add to series</button>
      </form>
      <ol class="assignment-list">${members.map((post) => `<li><span class="assignment-position">${Number(post.position) + 1}</span><span class="assignment-title"><strong>${escapeHtml(String(post.title))}</strong><span class="meta">Article</span></span><form method="post" action="${config.controlPanelPath}/series/${item.id}/posts/${post.id}/remove"><button class="button" type="submit">Remove</button></form></li>`).join("") || "<li class='assignment-empty'>No articles assigned.</li>"}</ol>
    </section>
    </div>`;
  return c.html(adminLayout("Edit Series", user, body));
});

adminRoutes.post("/series/:id", async (c) => {
  const form = await c.req.formData();
  try {
    await updateSeries(Number(c.req.param("id")), { title: String(form.get("title") ?? ""), slug: String(form.get("slug") ?? ""), description: String(form.get("description") ?? ""), commentsEnabled: form.has("commentsEnabled") });
    await renderPublishedArtifacts();
    return c.redirect(`${config.controlPanelPath}/series/${c.req.param("id")}/edit?success=${encodeURIComponent("Series saved.")}`);
  } catch (error) {
    if (error instanceof AppValidationError) return c.redirect(`${config.controlPanelPath}/series/${c.req.param("id")}/edit?error=${encodeURIComponent(error.message)}`);
    throw error;
  }
});

adminRoutes.post("/series/:id/posts", async (c) => {
  const form = await c.req.formData();
  const postId = Number(form.get("postId"));
  if (postId) await assignPostToSeries(Number(c.req.param("id")), postId, Number(form.get("position") ?? 0));
  await renderPublishedArtifacts();
  return c.redirect(`${config.controlPanelPath}/series/${c.req.param("id")}/edit?success=${encodeURIComponent("Article assigned.")}`);
});

adminRoutes.post("/series/:id/posts/:postId/remove", async (c) => {
  await removePostFromSeries(Number(c.req.param("postId")));
  await renderPublishedArtifacts();
  return c.redirect(`${config.controlPanelPath}/series/${c.req.param("id")}/edit?success=${encodeURIComponent("Article removed.")}`);
});

adminRoutes.post("/series/:id/delete", async (c) => {
  await deleteSeries(Number(c.req.param("id")));
  await renderPublishedArtifacts();
  return c.redirect(`${config.controlPanelPath}/series?success=${encodeURIComponent("Series deleted.")}`);
});

adminRoutes.get("/page-groups", async (c) => {
  const groups = await listPageGroups();
  const body = `<div class="content-list-page">${queryNotice(c)}
    <div class="row" style="justify-content:space-between; align-items:center; margin-bottom:20px;"><p class="meta">Organize fixed pages under a shared parent and order.</p><a class="button button-primary" href="${config.controlPanelPath}/page-groups/new">New page group</a></div>
    <table class="data-table"><thead><tr><th>Group</th><th>Slug</th><th>Pages</th><th>Actions</th></tr></thead><tbody>${groups.map((item) => `<tr><td class="cell-long"><strong>${escapeHtml(item.title)}</strong><br><span class="meta">${escapeHtml(item.description ?? "")}</span></td><td><code>${escapeHtml(item.slug)}</code></td><td>${item.pageCount}</td><td class="cell-actions"><div class="row"><a class="button" href="${config.controlPanelPath}/page-groups/${item.id}/edit">Manage pages</a><form method="post" action="${config.controlPanelPath}/page-groups/${item.id}/delete"><button class="button" type="submit">Delete</button></form></div></td></tr>`).join("") || "<tr><td colspan='4'>No page groups yet.</td></tr>"}</tbody></table>
  </div>`;
  return c.html(adminLayout("Page groups", c.get("sessionUser"), body, "wide-list"));
});

adminRoutes.get("/page-groups/new", (c) => c.html(adminLayout("New Page Group", c.get("sessionUser"), `${queryNotice(c)}
  <form method="post" action="${config.controlPanelPath}/page-groups" class="editor-form form-grid">
    <section class="editor-section">
      <p class="editor-section-kicker">Organization</p>
      <h2 class="editor-section-title">Page group information</h2>
      <p class="meta">Create the parent section first, then add and order its fixed pages.</p>
      <div class="form-grid">
        <label>Group title <input name="title" required placeholder="e.g. Company information" /></label>
        <label>Slug <input name="slug" required placeholder="company" /></label>
        <label>Description <textarea name="description"></textarea></label>
      </div>
    </section>
    <div class="row"><button class="button button-primary" type="submit">Create page group</button></div>
  </form>`)));

adminRoutes.post("/page-groups", async (c) => {
  const form = await c.req.formData();
  try {
    const item = await createPageGroup({ title: String(form.get("title") ?? ""), slug: String(form.get("slug") ?? ""), description: String(form.get("description") ?? "") });
    return c.redirect(`${config.controlPanelPath}/page-groups/${item?.id ?? ""}/edit?success=${encodeURIComponent("Page group created.")}`);
  } catch (error) {
    if (error instanceof AppValidationError) return c.html(adminLayout("New Page Group", c.get("sessionUser"), noticeCard(error.message, "error")), 400);
    throw error;
  }
});

adminRoutes.get("/page-groups/:id/edit", async (c) => {
  const item = await getPageGroupById(Number(c.req.param("id")));
  if (!item) return c.text("Not found", 404);
  const pages = await listPages({ page: 1, limit: 50, status: "any" });
  const members = await listPageGroupMembers(item.id);
  const memberIds = new Set(members.map((page) => Number(page.id)));
  const body = `${queryNotice(c)}
    <div class="editor-form group-editor">
      <section class="editor-section">
        <p class="editor-section-kicker">Organization</p>
        <h2 class="editor-section-title">Page group information</h2>
        <p class="meta">This parent controls the shared URL scope and description for its fixed pages.</p>
        <form method="post" action="${config.controlPanelPath}/page-groups/${item.id}" class="form-grid">
          <label>Group title <input name="title" value="${escapeHtml(item.title)}" required /></label>
          <label>Slug <input name="slug" value="${escapeHtml(item.slug)}" required /></label>
          <label>Description <textarea name="description">${escapeHtml(item.description ?? "")}</textarea></label>
          <button class="button button-primary" type="submit">Save page group</button>
        </form>
      </section>
      <section class="editor-section">
        <p class="editor-section-kicker">Group contents</p>
        <div class="section-heading-row"><div><h2 class="editor-section-title">Grouped pages</h2><p class="meta">${members.length} pages in ${escapeHtml(item.title)}</p></div></div>
        <form method="post" action="${config.controlPanelPath}/page-groups/${item.id}/pages" class="assignment-form">
          <label>Add page<select name="pageId"><option value="">Select a page</option>${pages.items.filter((page) => !memberIds.has(page.id)).map((page) => `<option value="${page.id}">${escapeHtml(page.title)}</option>`).join("")}</select></label>
          <label class="assignment-order">Order<input type="number" name="position" min="0" value="${members.length}" /></label>
          <button class="button button-primary" type="submit">Add to group</button>
        </form>
        <ol class="assignment-list">${members.map((page) => `<li><span class="assignment-position">${Number(page.position) + 1}</span><span class="assignment-title"><strong>${escapeHtml(String(page.title))}</strong><span class="meta">Fixed page</span></span><form method="post" action="${config.controlPanelPath}/page-groups/${item.id}/pages/${page.id}/remove"><button class="button" type="submit">Remove</button></form></li>`).join("") || "<li class='assignment-empty'>No pages assigned.</li>"}</ol>
      </section>
    </div>`;
  return c.html(adminLayout("Edit Page Group", c.get("sessionUser"), body));
});

adminRoutes.post("/page-groups/:id", async (c) => {
  const form = await c.req.formData();
  try { await updatePageGroup(Number(c.req.param("id")), { title: String(form.get("title") ?? ""), slug: String(form.get("slug") ?? ""), description: String(form.get("description") ?? "") }); return c.redirect(`${config.controlPanelPath}/page-groups/${c.req.param("id")}/edit?success=${encodeURIComponent("Page group saved.")}`); }
  catch (error) { if (error instanceof AppValidationError) return c.redirect(`${config.controlPanelPath}/page-groups/${c.req.param("id")}/edit?error=${encodeURIComponent(error.message)}`); throw error; }
});

adminRoutes.post("/page-groups/:id/pages", async (c) => { const form = await c.req.formData(); const pageId = Number(form.get("pageId")); if (pageId) await assignPageToGroup(Number(c.req.param("id")), pageId, Number(form.get("position") ?? 0)); return c.redirect(`${config.controlPanelPath}/page-groups/${c.req.param("id")}/edit?success=${encodeURIComponent("Page assigned.")}`); });
adminRoutes.post("/page-groups/:id/pages/:pageId/remove", async (c) => { await removePageFromGroup(Number(c.req.param("pageId"))); return c.redirect(`${config.controlPanelPath}/page-groups/${c.req.param("id")}/edit?success=${encodeURIComponent("Page removed.")}`); });
adminRoutes.post("/page-groups/:id/delete", async (c) => { await deletePageGroup(Number(c.req.param("id"))); return c.redirect(`${config.controlPanelPath}/page-groups?success=${encodeURIComponent("Page group deleted.")}`); });

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
          <td class="cell-long">${escapeHtml(menu.title)}</td>
          <td><code>${escapeHtml(menu.slug)}</code></td>
          <td>${escapeHtml(menu.status)}</td>
          <td>${menu.items.length}</td>
          <td class="cell-actions"><div class="row"><a class="button" href="${config.controlPanelPath}/menus/${menu.id}/edit">Edit</a><form method="post" action="${config.controlPanelPath}/menus/${menu.id}/delete"><button class="button" type="submit">Delete</button></form></div></td>
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
      <thead><tr><th>Title</th><th>Slug</th><th>Layout</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead>
      <tbody>
        ${blocks.map((block) => `<tr>
          <td class="cell-long">${escapeHtml(block.title)}</td>
          <td><code>${escapeHtml(block.slug)}</code></td>
          <td>${escapeHtml(contentBlockLayouts.find((layout) => layout.id === block.layoutType)?.name ?? "Plain")}</td>
          <td>${escapeHtml(block.status)}</td>
          <td>${adminDate(block.updatedAt)}</td>
          <td class="cell-actions"><div class="row"><a class="button" href="${config.controlPanelPath}/blocks/${block.id}/edit">Edit</a><form method="post" action="${config.controlPanelPath}/blocks/${block.id}/delete"><button class="button" type="submit">Delete</button></form></div></td>
        </tr>`).join("") || "<tr><td colspan='6'>No blocks yet.</td></tr>"}
      </tbody>
    </table>
  `;
  return c.html(adminLayout("Reusable Blocks", user, body));
});

adminRoutes.get("/blocks/new", (c) => c.html(adminLayout("New Block", c.get("sessionUser"), queryNotice(c) + blockForm(`${config.controlPanelPath}/blocks`), "wide-list")));

adminRoutes.post("/blocks", async (c) => {
  const user = c.get("sessionUser");
  if (!user) return c.redirect("/login");
  const form = await c.req.formData();
  const values = blockValuesFromForm(form);
  try {
    const block = await createBlock({ title: values.title, slug: values.slug, bodyHtml: values.bodyHtml, layoutType: values.layoutType, status: values.status as "draft" | "published" }, user.id);
    await writeAuditLog({ actorUserId: user.id, action: "block.create", targetType: "content_block", targetId: block?.id ?? null, summary: `Created block "${values.title}".`, ipAddress: requestIp(c) });
    await renderPublishedArtifacts();
    return c.redirect(`${config.controlPanelPath}/blocks?success=${encodeURIComponent("Block saved.")}`);
  } catch (error) {
    if (error instanceof AppValidationError) return c.html(adminLayout("New Block", user, noticeCard(error.message, "error") + blockForm(`${config.controlPanelPath}/blocks`, values), "wide-list"), 400);
    throw error;
  }
});

adminRoutes.get("/blocks/:id/edit", async (c) => {
  const block = await getBlockById(Number(c.req.param("id")));
  if (!block) return c.text("Not found", 404);
  return c.html(adminLayout("Edit Block", c.get("sessionUser"), queryNotice(c) + blockForm(`${config.controlPanelPath}/blocks/${block.id}`, {
    title: block.title, slug: block.slug, status: block.status, bodyHtml: block.bodyHtml, layoutType: block.layoutType,
  }), "wide-list"));
});

adminRoutes.post("/blocks/:id", async (c) => {
  const user = c.get("sessionUser");
  if (!user) return c.redirect("/login");
  const form = await c.req.formData();
  const values = blockValuesFromForm(form);
  try {
    const block = await updateBlock(Number(c.req.param("id")), { title: values.title, slug: values.slug, bodyHtml: values.bodyHtml, layoutType: values.layoutType, status: values.status as "draft" | "published" });
    await writeAuditLog({ actorUserId: user.id, action: "block.update", targetType: "content_block", targetId: c.req.param("id"), summary: `Updated block "${values.title}".`, ipAddress: requestIp(c) });
    await renderPublishedArtifacts();
    return c.redirect(`${config.controlPanelPath}/blocks/${block?.id ?? c.req.param("id")}/edit?success=${encodeURIComponent("Block updated.")}`);
  } catch (error) {
    if (error instanceof AppValidationError) return c.html(adminLayout("Edit Block", user, noticeCard(error.message, "error") + blockForm(`${config.controlPanelPath}/blocks/${c.req.param("id")}`, values), "wide-list"), 400);
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

adminRoutes.get("/maps", async (c) => {
  const user = c.get("sessionUser");
  const maps = await listMaps("any");
  const body = `<div class="content-list-page">
    ${queryNotice(c)}
    <div class="section-heading-row" style="margin-bottom:20px"><div><h2>Maps and snippets</h2><p class="meta">Manage reusable pinpoint and route maps for CMS content and existing public_html files.</p></div>${hasPermission(user, "maps.write") ? `<a class="button button-primary" href="${config.controlPanelPath}/maps/new">New map</a>` : ""}</div>
    <table class="data-table"><thead><tr><th>Title</th><th>Provider</th><th>Mode</th><th>Status</th><th>Shortcode</th><th>Updated</th><th>Actions</th></tr></thead><tbody>
      ${maps.map((map) => `<tr><td class="cell-long">${escapeHtml(map.title)}</td><td>${map.provider === "google" ? "Google Maps" : "OpenStreetMap"}</td><td>${map.displayMode === "route" ? "Route" : "Pinpoint marker"}</td><td>${escapeHtml(map.status)}</td><td><code>[[map:${escapeHtml(map.slug)}]]</code></td><td>${adminDate(map.updatedAt)}</td><td class="cell-actions"><div class="row">${hasPermission(user, "maps.write") ? `<a class="button" href="${config.controlPanelPath}/maps/${map.id}/edit">Edit</a>` : ""}${hasPermission(user, "maps.delete") ? `<form method="post" action="${config.controlPanelPath}/maps/${map.id}/delete"><button class="button" type="submit">Delete</button></form>` : ""}</div></td></tr>`).join("") || `<tr><td colspan="7">No maps yet.</td></tr>`}
    </tbody></table>
    <section class="editor-section"><p class="editor-section-kicker">Public HTML / PHP</p><h2 class="editor-section-title">Reusable loader</h2><p>Place a map container and the generated loader in any file served from <code>public_html</code>.</p><pre><code>${escapeHtml('<div data-hsc-map="map-slug"></div>\n<script src="/cms/maps.js" defer></script>')}</code></pre></section>
  </div>`;
  return c.html(adminLayout("Maps and Snippets", user, body, "wide-list"));
});

adminRoutes.get("/maps/new", (c) => c.html(adminLayout("New Map", c.get("sessionUser"), queryNotice(c) + mapForm(`${config.controlPanelPath}/maps`))));

adminRoutes.post("/maps", async (c) => {
  const user = c.get("sessionUser");
  if (!user) return c.redirect("/login");
  const values = mapValuesFromForm(await c.req.formData());
  try {
    const map = await createMap(mapInput(values), user.id);
    await writeAuditLog({ actorUserId: user.id, action: "map.create", targetType: "map_embed", targetId: map?.id ?? null, summary: `Created map "${values.title}".`, ipAddress: requestIp(c) });
    await renderPublishedArtifacts();
    return c.redirect(`${config.controlPanelPath}/maps/${map?.id}/edit?success=${encodeURIComponent("Map saved and public snippets regenerated.")}`);
  } catch (error) {
    if (error instanceof AppValidationError) return c.html(adminLayout("New Map", user, noticeCard(error.message, "error") + mapForm(`${config.controlPanelPath}/maps`, values)), 400);
    throw error;
  }
});

adminRoutes.get("/maps/:id/edit", async (c) => {
  const map = await getMapById(Number(c.req.param("id")));
  if (!map) return c.text("Not found", 404);
  return c.html(adminLayout("Edit Map", c.get("sessionUser"), queryNotice(c) + mapForm(`${config.controlPanelPath}/maps/${map.id}`, {
    title: map.title, slug: map.slug, provider: map.provider, displayMode: map.displayMode,
    startLat: String(map.startLat), startLng: String(map.startLng), startLabel: map.startLabel,
    endLat: map.endLat == null ? "" : String(map.endLat), endLng: map.endLng == null ? "" : String(map.endLng), endLabel: map.endLabel,
    travelMode: map.travelMode, zoom: String(map.zoom), height: String(map.height), status: map.status,
  })));
});

adminRoutes.post("/maps/:id", async (c) => {
  const user = c.get("sessionUser");
  if (!user) return c.redirect("/login");
  const values = mapValuesFromForm(await c.req.formData());
  try {
    const map = await updateMap(Number(c.req.param("id")), mapInput(values));
    if (!map) return c.text("Not found", 404);
    await writeAuditLog({ actorUserId: user.id, action: "map.update", targetType: "map_embed", targetId: map.id, summary: `Updated map "${values.title}".`, ipAddress: requestIp(c) });
    await renderPublishedArtifacts();
    return c.redirect(`${config.controlPanelPath}/maps/${map.id}/edit?success=${encodeURIComponent("Map updated and public snippets regenerated.")}`);
  } catch (error) {
    if (error instanceof AppValidationError) return c.html(adminLayout("Edit Map", user, noticeCard(error.message, "error") + mapForm(`${config.controlPanelPath}/maps/${c.req.param("id")}`, values)), 400);
    throw error;
  }
});

adminRoutes.post("/maps/:id/delete", async (c) => {
  const user = c.get("sessionUser");
  await deleteMap(Number(c.req.param("id")));
  await writeAuditLog({ actorUserId: user?.id ?? null, action: "map.delete", targetType: "map_embed", targetId: c.req.param("id"), summary: `Deleted map #${c.req.param("id")}.`, ipAddress: requestIp(c) });
  await renderPublishedArtifacts();
  return c.redirect(`${config.controlPanelPath}/maps?success=${encodeURIComponent("Map deleted and public snippets regenerated.")}`);
});

adminRoutes.get("/proposals", async (c) => {
  const user = c.get("sessionUser");
  const proposals = await listAiFileProposals("pending");
  const body = `
    ${queryNotice(c)}
    <h2>AI file proposals</h2>
    <p class="meta">AI agents can suggest public_html changes, but nothing is written until an operator reviews the diff and approves it.</p>
    <table><thead><tr><th>Created</th><th>Path</th><th>Reason</th><th>Actions</th></tr></thead><tbody>
      ${proposals.map((proposal) => `<tr><td>${adminDate(proposal.createdAt)}</td><td><code>${escapeHtml(proposal.relativePath)}</code></td><td>${escapeHtml(proposal.reason)}</td><td><a class="button" href="${config.controlPanelPath}/proposals/${proposal.id}">Review</a></td></tr>`).join("") || "<tr><td colspan='4'>No pending proposals.</td></tr>"}
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
  if (!user) return c.redirect("/login");
  const usageFilter = c.req.query("usage") ?? "all";
  const allItems = await listMediaUsage();
  const items = allItems.filter((item) =>
    usageFilter === "unused" ? item.references.length === 0
      : usageFilter === "used" ? item.references.length > 0
        : true);
  const unusedCount = allItems.filter((item) => item.references.length === 0).length;
  const canDeleteMedia = hasPermission(user, "media.delete");
  const usage = await getMediaStorageUsage(user.id);
  const storage = mediaStorageState(usage);
  const quotaLabel = (usedBytes: number, quotaBytes: number) =>
    `${formatByteSize(usedBytes)} / ${quotaBytes > 0 ? formatByteSize(quotaBytes) : '<span data-i18n="Unlimited">Unlimited</span>'}`;
  const uploadDisabled = storage.uploadAllowed ? "" : " disabled";
  const body = `
    ${queryNotice(c)}
    <div class="grid">
      <article>
        <h2>Upload media</h2>
        <form method="post" action="${config.controlPanelPath}/media" enctype="multipart/form-data" class="form-grid">
          <label>File <input type="file" name="file" required${uploadDisabled} /></label>
          <label>Alt text <input name="altText" placeholder="Helpful for images and embeds"${uploadDisabled} /></label>
          <div class="row">
            <button class="button button-primary" type="submit"${uploadDisabled}>Upload file</button>
          </div>
          <p class="meta">Allowed types: JPG, PNG, WebP, GIF, SVG, MP4, WebM, OGG video, MP3, M4A, OGG audio, WAV, PDF, TXT.</p>
        </form>
      </article>
      <aside>
        <h2>Storage usage</h2>
        <dl style="display:grid;grid-template-columns:max-content minmax(0,1fr);gap:10px 16px;margin:0 0 16px;">
          <dt class="meta">Site storage</dt><dd style="margin:0;">${quotaLabel(storage.site.usedBytes, storage.site.quotaBytes)}</dd>
          <dt class="meta">Your storage</dt><dd style="margin:0;">${quotaLabel(storage.user.usedBytes, storage.user.quotaBytes)}</dd>
          <dt class="meta">Per-file limit</dt><dd style="margin:0;">${formatByteSize(storage.maxUploadBytes)}</dd>
          <dt class="meta">Upload status</dt><dd style="margin:0;">${storage.uploadAllowed ? "Upload allowed" : "Upload blocked by role policy"}</dd>
        </dl>
        <p class="meta">Storage quotas are calculated from media records in PostgreSQL.</p>
        <p class="meta">Raster images generate resized display, thumbnail, WebP, and AVIF files. Derived files count toward storage quotas.</p>
        <p>Uploaded files are published under the <code>/cms/uploads/</code> path so existing HTML and PHP pages can reference them directly.</p>
      </aside>
    </div>
    <div style="margin-top:20px;">
      <div class="section-heading-row">
        <div><h2>Media library</h2><p class="meta"><span data-i18n="Unused media">Unused media</span>: ${unusedCount} / ${allItems.length}</p></div>
        <nav class="media-usage-filters" aria-label="Media usage filter">
          <a class="button ${usageFilter === "all" ? "button-primary" : ""}" href="${config.controlPanelPath}/media?usage=all">All media</a>
          <a class="button ${usageFilter === "used" ? "button-primary" : ""}" href="${config.controlPanelPath}/media?usage=used">Used</a>
          <a class="button ${usageFilter === "unused" ? "button-primary" : ""}" href="${config.controlPanelPath}/media?usage=unused">Unused</a>
        </nav>
      </div>
      <p class="meta">References are checked in posts, pages, blocks, menus, forms, revisions, and text-based files under public_html. Upload files themselves are excluded from scanning.</p>
      <table>
        <thead><tr>${canDeleteMedia ? "<th><span class='sr-only'>Select</span></th>" : ""}<th>Preview</th><th>Name</th><th>Type</th><th>Reference status</th><th>URL</th><th>Actions</th></tr></thead>
        <tbody>
          ${items
            .map((item) => {
              const isUnused = item.references.length === 0;
              const preview = item.mimeType.startsWith("image/")
                ? `<img src="${mediaPreviewUrl(item)}" alt="${escapeHtml(item.altText ?? item.originalName)}" style="max-width:96px; max-height:72px; border-radius:8px; border:1px solid var(--line);" loading="lazy" decoding="async" />`
                : `<span class="meta">No preview</span>`;
              const variantLinks = item.variants
                .filter((variant) => variant.kind !== "thumbnail")
                .map((variant) => {
                  const kind = variant.kind === "display" ? "Display" : "Responsive";
                  return `<a href="${variant.publicUrl}"><span data-i18n="${kind}">${kind}</span> ${escapeHtml(`${variant.format.toUpperCase()} ${variant.width}×${variant.height}`)}</a>`;
                })
                .join(" · ");
              return `
                <tr>
                  ${canDeleteMedia ? `<td>${isUnused ? `<input type="checkbox" name="mediaIds" value="${item.id}" form="unused-media-cleanup" aria-label="Select unused media" />` : ""}</td>` : ""}
                  <td>${preview}</td>
                  <td class="cell-long">
                    <strong>${escapeHtml(item.originalName)}</strong>
                    <div class="meta">${item.width && item.height ? `${item.width} × ${item.height} px · ` : ""}<span data-i18n="Original">Original</span> ${formatByteSize(item.sizeBytes)}</div>
                    ${item.variants.length ? `<div class="meta"><span data-i18n="Total with variants">Total with variants</span> ${formatByteSize(mediaTotalSizeBytes(item))}</div>` : ""}
                  </td>
                  <td>${escapeHtml(item.mimeType)}</td>
                  <td class="cell-long">
                    <span class="media-usage-badge ${isUnused ? "media-usage-unused" : "media-usage-used"}">${isUnused ? "Unused" : "Used"}</span>
                    ${isUnused ? `<div class="meta">No references detected.</div>` : `<details class="media-reference-details"><summary>${item.references.length} <span data-i18n="references">references</span></summary><ul>${item.references.map((reference) => {
                      const href = reference.sourceType === "post" ? `${config.controlPanelPath}/posts/${reference.sourceId}/edit`
                        : reference.sourceType === "page" ? `${config.controlPanelPath}/pages/${reference.sourceId}/edit`
                          : reference.sourceType === "block" ? `${config.controlPanelPath}/blocks/${reference.sourceId}/edit`
                            : reference.sourceType === "menu" ? `${config.controlPanelPath}/menus/${reference.sourceId}/edit`
                              : reference.sourceType === "form" ? `${config.controlPanelPath}/forms/${reference.sourceId}/edit`
                                : "";
                      const label = `${reference.title} · ${reference.field}`;
                      return `<li>${href ? `<a href="${href}">${escapeHtml(label)}</a>` : `<span>${escapeHtml(label)}</span>`}</li>`;
                    }).join("")}</ul></details>`}
                  </td>
                  <td class="cell-long"><a href="${item.publicUrl}" data-i18n="Original">Original</a>${variantLinks ? `<div class="meta">${variantLinks}</div>` : ""}</td>
                  <td class="cell-actions">
                    <div class="row">
                      <a class="button" href="${item.publicUrl}">Open</a>
                      ${canDeleteMedia ? isUnused ? `<form method="post" action="${config.controlPanelPath}/media/${item.id}/delete"><button class="button" type="submit">Delete</button></form>` : `<button class="button" type="button" disabled title="Remove references before deleting this media.">Delete</button>` : ""}
                    </div>
                  </td>
                </tr>`;
            })
            .join("") || `<tr><td colspan="${canDeleteMedia ? 7 : 6}">No media matches this usage filter.</td></tr>`}
        </tbody>
      </table>
      ${canDeleteMedia && unusedCount > 0 ? `<form id="unused-media-cleanup" method="post" action="${config.controlPanelPath}/media/cleanup" class="media-cleanup-form">
        <div><strong>Clean up selected unused media</strong><p class="meta">References are checked again immediately before every deletion.</p></div>
        <label class="checkbox-label"><input type="checkbox" name="confirmed" value="true" required /><span>I understand that deleted files cannot be restored.</span></label>
        <button class="button" type="submit">Delete selected unused media</button>
      </form>` : ""}
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

  try {
    const media = await uploadMedia(file, altText, user.id);
    await writeAuditLog({
      actorUserId: user.id,
      action: "media.upload",
      targetType: "media",
      targetId: media?.id ?? file.name,
      summary: `Uploaded media "${file.name}".`,
      ipAddress: requestIp(c),
    });
    return c.redirect(`${config.controlPanelPath}/media?success=${encodeURIComponent("Media uploaded.")}`);
  } catch (error) {
    if (!(error instanceof AppValidationError)) {
      logError("media.upload_failed", "Media upload failed.", { error, userId: user.id });
    }
    const message = error instanceof AppValidationError ? error.message : "Unable to upload media.";
    return c.redirect(`${config.controlPanelPath}/media?error=${encodeURIComponent(message)}`);
  }
});

adminRoutes.post("/media/:id/delete", async (c) => {
  try {
    await deleteMedia(Number(c.req.param("id")));
    await writeAuditLog({
      actorUserId: c.get("sessionUser")?.id ?? null,
      action: "media.delete",
      targetType: "media",
      targetId: c.req.param("id"),
      summary: `Deleted unused media #${c.req.param("id")}.`,
      ipAddress: requestIp(c),
    });
    return c.redirect(`${config.controlPanelPath}/media?success=${encodeURIComponent("Unused media deleted.")}`);
  } catch (error) {
    const message = error instanceof AppValidationError ? error.message : "Unable to delete media.";
    return c.redirect(`${config.controlPanelPath}/media?error=${encodeURIComponent(message)}`);
  }
});

adminRoutes.post("/media/cleanup", async (c) => {
  const form = await c.req.formData();
  if (form.get("confirmed") !== "true") {
    return c.redirect(`${config.controlPanelPath}/media?usage=unused&error=${encodeURIComponent("Confirm the cleanup before deleting media.")}`);
  }
  const ids = form.getAll("mediaIds").map((value) => Number(value)).filter((id) => Number.isSafeInteger(id) && id > 0);
  if (ids.length === 0) {
    return c.redirect(`${config.controlPanelPath}/media?usage=unused&error=${encodeURIComponent("Select at least one unused media item.")}`);
  }
  const result = await deleteUnusedMedia(ids);
  await writeAuditLog({
    actorUserId: c.get("sessionUser")?.id ?? null,
    action: "media.cleanup",
    targetType: "media",
    targetId: null,
    summary: `Deleted ${result.deleted.length} unused media items; skipped ${result.skipped.length} referenced items.`,
    ipAddress: requestIp(c),
  });
  const message = result.skipped.length > 0
    ? `Deleted ${result.deleted.length} unused media items. ${result.skipped.length} items were skipped because references were found.`
    : `Deleted ${result.deleted.length} unused media items.`;
  return c.redirect(`${config.controlPanelPath}/media?usage=unused&success=${encodeURIComponent(message)}`);
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
                <td>${adminDate(item.createdAt)}</td>
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
            <input name="relativePath" placeholder="index.html or assets/css/site.css" required />
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
                  <td>${adminDate(item.createdAt)}</td>
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
