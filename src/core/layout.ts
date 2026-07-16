// File: /src/core/layout.ts
// Filename: layout.ts
// Description: 管理画面（コントロールパネル）の共通HTMLレイアウトテンプレート。
//   note.com風のシンプル・クリーン・ハイクオリティなデザインシステムを提供する。
//   多言語対応（EN / JA / ZH）のナビゲーション・i18nスクリプトを含む。

import { config } from "./config";
import { escapeHtml } from "./content";
import type { SessionUser } from "./types";
import { listAdminLinks } from "./extensions";
import { hasPermission } from "./permissions";
import { adminTranslations } from "./i18n";

export function adminLayout(title: string, user: SessionUser | null, body: string) {
  const csrfField = user?.csrfToken
    ? `<input type="hidden" name="_csrf" value="${escapeHtml(user.csrfToken)}" />`
    : "";
  const can = (permission: Parameters<typeof hasPermission>[1]) => Boolean(user && hasPermission(user, permission));
  const nav = user
    ? `
      <nav class="shell-nav">
        <div class="shell-nav-group">
          <p class="shell-nav-label" data-i18n="Overview">Overview</p>
          <a data-i18n="Dashboard" href="${config.controlPanelPath}">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            Dashboard
          </a>
        </div>
        <div class="shell-nav-group">
          <div class="shell-nav-subgroup">
            <p class="shell-nav-sublabel" data-i18n="Articles">Articles</p>
            ${can("posts.write") ? `<a data-i18n="New post" href="${config.controlPanelPath}/posts/new" class="nav-action"><span class="nav-icon">＋</span>Create post</a>` : ""}
            ${can("posts.read") ? `<a data-i18n="Posts" href="${config.controlPanelPath}/posts">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>
            Post list
          </a>` : ""}
          ${can("series.read") ? `<a data-i18n="Series" href="${config.controlPanelPath}/series">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6h16M4 12h10M4 18h16"/><circle cx="18" cy="12" r="2"/></svg>
            Series
          </a>` : ""}
          </div>
          <div class="shell-nav-subgroup">
            <p class="shell-nav-sublabel" data-i18n="Fixed pages">Fixed pages</p>
            ${can("pages.write") ? `<a data-i18n="New page" href="${config.controlPanelPath}/pages/new" class="nav-action"><span class="nav-icon">＋</span>Create page</a>` : ""}
            ${can("pages.read") ? `<a data-i18n="Pages" href="${config.controlPanelPath}/pages">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6"/></svg>
            Page list
          </a>` : ""}
          ${can("page_groups.read") ? `<a data-i18n="Page groups" href="${config.controlPanelPath}/page-groups">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="5" rx="1"/><rect x="3" y="15" width="18" height="5" rx="1"/></svg>
            Page groups
          </a>` : ""}
          </div>
          <div class="shell-nav-subgroup shell-nav-separated">
            <p class="shell-nav-sublabel" data-i18n="Forms and media">Forms and media</p>
            ${can("forms.read") ? `<a data-i18n="Forms" href="${config.controlPanelPath}/forms">Forms</a>` : ""}
            ${can("media.read") ? `<a data-i18n="Media" href="${config.controlPanelPath}/media">Media</a>` : ""}
          </div>
        </div>
        <div class="shell-nav-group">
          <p class="shell-nav-label" data-i18n="Site structure">Site structure</p>
          ${can("menus.read") ? `<a data-i18n="Menus" href="${config.controlPanelPath}/menus">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            Menus
          </a>` : ""}
          ${can("blocks.read") ? `<a data-i18n="Blocks" href="${config.controlPanelPath}/blocks">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
            Blocks
          </a>` : ""}
          ${can("ai.review") ? `<a data-i18n="AI proposals" href="${config.controlPanelPath}/proposals">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a7 7 0 017 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 01-2 2h-4a2 2 0 01-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 017-7z"/><line x1="9" y1="21" x2="15" y2="21"/></svg>
            AI proposals
          </a>` : ""}
          <a data-i18n="API" href="${config.cmsApiPrefix}/posts">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            API
          </a>
          ${listAdminLinks().map((link) => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`).join("")}
        </div>
        <div class="shell-nav-group">
          <p class="shell-nav-label" data-i18n="Operations">Operations</p>
          ${can("users.manage") ? `<a data-i18n="Users" href="${config.controlPanelPath}/users">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            Users
          </a>` : ""}
          ${can("audit.read") ? `<a data-i18n="Logs" href="${config.controlPanelPath}/logs">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            Logs
          </a>` : ""}
          ${can("snapshots.read") ? `<a data-i18n="Snapshots" href="${config.controlPanelPath}/snapshots">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
            Snapshots
          </a>` : ""}
        </div>
        <div class="shell-language" aria-label="Switch language"><span data-i18n="Switch language">Language</span><button type="button" data-locale="en">EN</button><button type="button" data-locale="ja">日本語</button><button type="button" data-locale="zh">简体中文</button></div>
        <form method="post" action="/logout"><button class="shell-logout-btn" data-i18n="Logout" type="submit">Logout</button></form>
      </nav>
    `
    : "";
  const protectedBody = user
    ? body.replace(/<form method="post"([^>]*)>/g, `<form method="post"$1>${csrfField}`)
    : body;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} | ${escapeHtml(config.appName)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <style>
      /* ========================================
         note.com-inspired Design System
         Clean, minimal, high-quality aesthetic
         ======================================== */

      :root {
        --bg: #ffffff;
        --panel: #ffffff;
        --sidebar: #ffffff;
        --sidebar-hover: #f6f6f6;
        --line: #ebebeb;
        --line-light: #f5f5f5;
        --ink: #333333;
        --ink-secondary: #555555;
        --muted: #999999;
        --accent: #41C9B4;
        --accent-hover: #35b5a2;
        --accent-light: rgba(65, 201, 180, 0.08);
        --accent-border: rgba(65, 201, 180, 0.25);
        --danger: #e0544e;
        --danger-bg: rgba(224, 84, 78, 0.06);
        --danger-border: rgba(224, 84, 78, 0.18);
        --success-bg: rgba(65, 201, 180, 0.06);
        --success-border: rgba(65, 201, 180, 0.18);
        --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.04);
        --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.06);
        --shadow-lg: 0 4px 16px rgba(0, 0, 0, 0.08);
        --radius-sm: 6px;
        --radius-md: 10px;
        --radius-lg: 14px;
        --radius-pill: 100px;
        --transition: 0.18s ease;
        --sidebar-width: 240px;
        --font-sans: 'Inter', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }

      /* ---- Reset & Base ---- */

      *, *::before, *::after { box-sizing: border-box; }

      body {
        margin: 0;
        min-height: 100vh;
        color: var(--ink);
        font-family: var(--font-sans);
        font-size: 14px;
        line-height: 1.7;
        background: var(--bg);
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      /* ---- Shell (unauthenticated) ---- */

      .shell {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        padding: 24px;
        max-width: 460px;
        margin: 0 auto;
      }

      .shell .shell-header {
        text-align: center;
        border-right: none;
        background: transparent;
        padding: 0 0 24px;
      }

      .shell .shell-card {
        width: 100%;
        padding: 0;
      }

      /* ---- Shell Admin (authenticated) ---- */

      .shell-admin {
        min-height: 100vh;
        display: grid;
        grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
        gap: 0;
        padding: 0;
        max-width: none;
        margin: 0;
      }

      /* ---- Header / Sidebar ---- */

      .shell-header,
      .shell-card {
        background: var(--panel);
        border: 0;
        border-radius: 0;
        box-shadow: none;
      }

      .shell-header {
        padding: 0;
        background: var(--sidebar);
        border-right: 1px solid var(--line);
      }

      .shell-admin .shell-header {
        position: sticky;
        top: 0;
        align-self: start;
        min-height: 100vh;
        max-height: 100vh;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
      }

      .shell-admin .shell-header::-webkit-scrollbar {
        width: 0;
      }

      /* Brand area at top of sidebar */
      .shell-brand {
        padding: 20px 20px 16px;
        border-bottom: 1px solid var(--line);
      }

      .shell-brand .meta {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.78rem;
        color: var(--muted);
        letter-spacing: 0.03em;
        margin: 0;
        white-space: nowrap;
      }

      .shell-brand .meta::before {
        content: '';
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--accent);
        flex-shrink: 0;
      }

      .shell-brand h1 {
        font-size: 1rem;
        font-weight: 600;
        margin: 8px 0 0;
        color: var(--ink);
        letter-spacing: -0.01em;
      }

      .shell-brand p:last-child {
        font-size: 0.82rem;
        color: var(--muted);
        margin: 4px 0 0;
      }

      /* ---- Main content ---- */

      .shell-card {
        width: 100%;
        max-width: 880px;
        margin: 0 auto;
        padding: 64px 48px 104px;
        color: var(--ink);
      }

      /* ---- Navigation ---- */

      .shell-nav {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 12px 12px 16px;
        flex: 1;
      }

      .shell-nav-group {
        display: flex;
        flex-direction: column;
        gap: 1px;
        padding: 0 0 8px;
        margin: 0 0 8px;
        border-bottom: 1px solid var(--line-light);
      }

      .shell-nav-group + .shell-nav-group {
        border-top: 1px solid var(--line-light);
        padding-top: 16px;
        margin-top: 8px;
      }

      .shell-nav-group:last-of-type { border-bottom: 0; margin-bottom: 0; }

      .shell-nav-label {
        margin: 0 8px 4px;
        padding-top: 4px;
        color: var(--muted);
        font-size: 0.7rem;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .shell-nav-subgroup {
        display: flex;
        flex-direction: column;
        gap: 1px;
        padding: 0 0 8px;
      }

      .shell-nav-subgroup + .shell-nav-subgroup {
        border-top: 1px solid var(--line-light);
        padding-top: 8px;
      }

      .shell-nav-separated {
        margin-top: 12px;
        padding-top: 16px;
        border-top: 1px solid var(--line-light);
      }

      .shell-nav-sublabel {
        margin: 0 8px 3px;
        color: var(--muted);
        font-size: 0.68rem;
        font-weight: 500;
        letter-spacing: 0.04em;
      }

      .nav-icon {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
        opacity: 0.55;
        transition: opacity var(--transition);
      }

      .shell-nav a,
      .shell-nav button {
        appearance: none;
        border: 0;
        background: transparent;
        color: var(--ink-secondary);
        border-radius: var(--radius-sm);
        padding: 7px 10px;
        text-decoration: none;
        cursor: pointer;
        font: inherit;
        font-size: 0.88rem;
        font-weight: 450;
        text-align: left;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: all var(--transition);
        line-height: 1.4;
      }

      .shell-nav a:hover,
      .shell-nav button:hover {
        background: var(--sidebar-hover);
        color: var(--ink);
      }

      .shell-nav a.active {
        background: #e5e5e7;
        color: var(--ink);
        font-weight: 600;
      }

      .shell-nav a.active .nav-icon {
        opacity: 0.85;
      }

      .shell-nav a:hover .nav-icon {
        opacity: 0.8;
      }

      .shell-nav a.nav-action {
        color: var(--accent);
        font-weight: 500;
      }

      .shell-nav a.nav-action:hover {
        background: var(--accent-light);
        color: var(--accent-hover);
      }

      .shell-nav a.nav-action .nav-icon {
        opacity: 0.7;
        color: var(--accent);
      }

      /* Language switch */
      .shell-language {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        align-items: center;
        padding: 8px 12px 4px;
        color: var(--muted);
        font-size: 0.78rem;
        border-top: 1px solid var(--line-light);
        margin-top: auto;
      }

      .shell-language > span {
        width: 100%;
        font-size: 0.7rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        margin-bottom: 2px;
      }

      .shell-language button {
        padding: 4px 10px;
        border-radius: var(--radius-pill);
        font-size: 0.75rem;
        font-weight: 500;
        background: var(--line-light);
        color: var(--muted);
        border: none;
        cursor: pointer;
        transition: all var(--transition);
      }

      .shell-language button:hover {
        background: var(--accent-light);
        color: var(--accent);
      }

      .shell-language button.active {
        background: var(--accent-light);
        color: var(--accent-hover);
        font-weight: 600;
      }

      /* Logout */
      .shell-logout-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        width: calc(100% - 24px);
        margin: 4px 12px 16px;
        padding: 8px 12px;
        border: 1px solid var(--line);
        border-radius: var(--radius-sm);
        background: transparent;
        color: var(--muted);
        font: inherit;
        font-size: 0.82rem;
        cursor: pointer;
        transition: all var(--transition);
        text-align: center;
        justify-content: center;
      }

      .shell-logout-btn:hover {
        background: var(--danger-bg);
        border-color: var(--danger-border);
        color: var(--danger);
      }

      /* ---- Buttons ---- */

      .button {
        appearance: none;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border: 1px solid var(--line);
        background: var(--panel);
        color: var(--ink-secondary);
        border-radius: var(--radius-pill);
        padding: 8px 18px;
        text-decoration: none;
        cursor: pointer;
        font: inherit;
        font-size: 0.86rem;
        font-weight: 500;
        text-align: center;
        transition: all var(--transition);
        white-space: nowrap;
        line-height: 1.4;
      }

      .button:hover {
        background: var(--sidebar-hover);
        border-color: #ddd;
        color: var(--ink);
      }

      .button:active {
        transform: scale(0.97);
      }

      .button-primary {
        background: var(--accent);
        border-color: var(--accent);
        color: #ffffff;
        font-weight: 600;
      }

      .button-primary:hover {
        background: var(--accent-hover);
        border-color: var(--accent-hover);
        color: #ffffff;
        box-shadow: var(--shadow-md);
      }

      .button-danger {
        background: transparent;
        border-color: var(--danger-border);
        color: var(--danger);
      }

      .button-danger:hover {
        background: var(--danger-bg);
        border-color: var(--danger);
      }

      /* ---- Typography ---- */

      h1, h2, h3 {
        margin-top: 0;
        font-weight: 600;
        letter-spacing: -0.01em;
        color: var(--ink);
      }

      h1 { font-size: 1.5rem; }
      h2 { font-size: 1.15rem; margin-bottom: 16px; }
      h3 { font-size: 1rem; }

      p {
        line-height: 1.7;
        margin: 0 0 12px;
      }

      a {
        color: var(--accent);
        text-decoration: none;
        transition: color var(--transition);
      }

      a:hover { color: var(--accent-hover); }

      code {
        font-size: 0.88em;
        padding: 2px 6px;
        border-radius: 4px;
        background: var(--line-light);
      }

      /* ---- Grid Layouts ---- */

      .grid {
        display: grid;
        gap: 24px;
      }

      .stats {
        display: grid;
        gap: 12px;
      }

      .stat {
        padding: 16px 18px;
        border-radius: var(--radius-md);
        background: var(--panel);
        border: 1px solid var(--line);
        transition: all var(--transition);
        box-shadow: var(--shadow-sm);
      }

      .stat:hover {
        box-shadow: var(--shadow-md);
        transform: translateY(-1px);
        border-color: var(--accent-border);
      }

      .stat .meta {
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-weight: 600;
        margin-bottom: 4px;
      }

      .stat h2 {
        font-size: 1.6rem;
        font-weight: 700;
        margin: 0;
        color: var(--ink);
      }

      /* ---- Tables ---- */

      table {
        width: 100%;
        border-collapse: collapse;
      }

      th {
        padding: 10px 12px 10px 0;
        text-align: left;
        border-bottom: 2px solid var(--line);
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--muted);
        vertical-align: top;
      }

      td {
        padding: 12px 12px 12px 0;
        text-align: left;
        border-bottom: 1px solid var(--line-light);
        vertical-align: top;
        font-size: 0.9rem;
      }

      tr {
        transition: background var(--transition);
      }

      tbody tr:hover {
        background: var(--accent-light);
      }

      td a {
        font-weight: 500;
      }

      /* ---- Forms ---- */

      .form-grid {
        display: grid;
        gap: 20px;
      }

      .editor-form { padding-block: 24px 56px; }
      .editor-section {
        display: grid;
        gap: 16px;
        padding: 24px 0 32px;
        border-bottom: 1px solid var(--line);
      }
      .editor-section:first-child { padding-top: 0; }
      .editor-section:last-of-type { padding-bottom: 40px; border-bottom: 0; }
      .editor-section-compact { gap: 14px; }
      .editor-collapsible { padding-block: 16px; }
      .editor-collapsible > summary,
      .editor-inline-details > summary {
        cursor: pointer;
        list-style: none;
      }
      .editor-collapsible > summary::-webkit-details-marker,
      .editor-inline-details > summary::-webkit-details-marker { display: none; }
      .editor-collapsible > summary::before,
      .editor-inline-details > summary::before {
        content: "+";
        display: inline-block;
        width: 1.2em;
        color: var(--accent);
        font-weight: 700;
      }
      .editor-collapsible[open] > summary::before,
      .editor-inline-details[open] > summary::before { content: "-"; }
      .editor-collapsible > summary .editor-section-title { display: block; }
      .editor-collapsible > summary + .form-grid { margin-top: 18px; }
      .editor-inline-details { display: grid; gap: 14px; padding-top: 4px; }
      .editor-inline-details[open] { padding-top: 12px; }
      .editor-section-kicker {
        margin: 0;
        color: var(--accent);
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .editor-section-title { margin: -8px 0 2px; font-size: 1.2rem; font-weight: 600; }

      label {
        display: grid;
        gap: 6px;
        font-weight: 600;
        font-size: 0.88rem;
        color: var(--ink);
      }

      label.checkbox-label {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 24px;
        font-weight: 500;
      }

      label.checkbox-label input[type="checkbox"] {
        width: 16px;
        min-width: 16px;
        height: 16px;
        margin: 0;
        padding: 0;
      }

      input, textarea, select {
        width: 100%;
        min-width: 0;
        padding: 10px 14px;
        border-radius: var(--radius-sm);
        border: 1px solid var(--line);
        background: var(--panel);
        color: var(--ink);
        font: inherit;
        font-size: 0.92rem;
        font-weight: 400;
        transition: border-color var(--transition), box-shadow var(--transition);
      }

      input::placeholder, textarea::placeholder {
        color: var(--muted);
        opacity: 1;
      }

      input:focus, textarea:focus, select:focus {
        outline: none;
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-light);
      }

      textarea {
        min-height: 160px;
        resize: vertical;
        line-height: 1.6;
      }

      fieldset {
        border: 1px solid var(--line);
        border-radius: var(--radius-md);
        padding: 16px;
        margin: 0;
      }

      fieldset legend {
        font-weight: 600;
        font-size: 0.88rem;
        padding: 0 8px;
      }

      /* ---- Utility ---- */

      .meta {
        color: var(--muted);
        font-size: 0.85rem;
      }

      .row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
      }

      /* ---- Notice / Alert cards ---- */

      .notice {
        padding: 14px 18px;
        border-radius: var(--radius-md);
        font-size: 0.9rem;
        margin-bottom: 20px;
        line-height: 1.5;
      }

      .notice-success {
        background: var(--success-bg);
        border: 1px solid var(--success-border);
        color: #2a7a6e;
      }

      .notice-error {
        background: var(--danger-bg);
        border: 1px solid var(--danger-border);
        color: #b4492c;
      }

      /* ---- Diff viewer ---- */

      .diff-add { background: rgba(65, 201, 180, 0.12); }
      .diff-del { background: rgba(224, 84, 78, 0.08); }
      pre {
        background: #fafafa;
        border: 1px solid var(--line);
        border-radius: var(--radius-sm);
        padding: 14px 16px;
        overflow-x: auto;
        font-size: 0.85rem;
        line-height: 1.5;
      }

      /* ---- Media grid ---- */

      .media-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 12px;
      }

      .media-card {
        border: 1px solid var(--line);
        border-radius: var(--radius-md);
        overflow: hidden;
        transition: all var(--transition);
      }

      .media-card:hover {
        box-shadow: var(--shadow-md);
        transform: translateY(-2px);
      }

      /* ---- Responsive ---- */

      @media (min-width: 860px) {
        .grid {
          grid-template-columns: 1.5fr 0.9fr;
        }
        .stats {
          grid-template-columns: repeat(4, 1fr);
        }
      }

      @media (min-width: 1200px) {
        .stats {
          grid-template-columns: repeat(8, 1fr);
        }
      }

      @media (max-width: 859px) {
        .shell-admin {
          display: flex;
          flex-direction: column;
        }
        .shell-admin .shell-header {
          position: static;
          min-height: 0;
          max-height: none;
          border-right: 0;
          border-bottom: 1px solid var(--line);
        }
        .shell-admin .shell-card {
          padding: 40px 20px 72px;
        }
        .shell-admin .shell-nav {
          flex-direction: row;
          flex-wrap: wrap;
          padding: 8px 12px;
          gap: 4px;
        }
        .shell-admin .shell-nav-group {
          flex-direction: row;
          flex-wrap: wrap;
          gap: 2px;
          border-bottom: none;
          padding: 0;
          margin: 0;
        }
        .shell-admin .shell-nav-group + .shell-nav-group,
        .shell-admin .shell-nav-separated {
          border-top: none;
          padding-top: 0;
          margin-top: 0;
        }
        .shell-admin .shell-nav-label {
          display: none;
        }
        .shell-brand {
          padding: 16px 20px 12px;
        }
        .shell-brand h1 {
          font-size: 0.9rem;
        }
        .shell-brand p:last-child {
          display: none;
        }
        .shell-language {
          border-top: none;
          padding: 4px 0;
        }
        .shell-language > span {
          display: none;
        }
        .shell-logout-btn {
          width: auto;
          margin: 4px 12px;
        }
        .stats {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      /* ---- Scrollbar (webkit) ---- */

      ::-webkit-scrollbar {
        width: 6px;
        height: 6px;
      }
      ::-webkit-scrollbar-track {
        background: transparent;
      }
      ::-webkit-scrollbar-thumb {
        background: #ddd;
        border-radius: 3px;
      }
      ::-webkit-scrollbar-thumb:hover {
        background: #bbb;
      }

      /* ---- Print ---- */

      @media print {
        .shell-header, .shell-nav, .shell-language, .shell-logout-btn { display: none; }
        .shell-admin { display: block; }
        .shell-card { padding: 0; max-width: none; }
      }
    </style>
  </head>
  <body>
    <main class="shell${user ? " shell-admin" : ""}">
      <header class="shell-header">
        <div class="shell-brand">
          <p class="meta"><span data-i18n="control panel">Control panel</span></p>
          <h1>${escapeHtml(title)}</h1>
          ${user ? `<p><span data-i18n="Signed in as">Signed in as</span> ${escapeHtml(user.displayName)}.</p>` : `<p data-i18n="Sign in to manage posts and generated fragments.">Sign in to manage posts and generated fragments.</p>`}
        </div>
        ${nav}
      </header>
      <section class="shell-card">${protectedBody}</section>
    </main>
    <script>
      const adminI18n = ${JSON.stringify(adminTranslations)};
      const locale = localStorage.getItem("hybrid-static-cms-locale") || "en";
      function applyAdminLocale(value) {
        const dictionary = adminI18n[value] || {};
        document.documentElement.lang = value === "zh" ? "zh-CN" : value;
        document.querySelectorAll("[data-i18n]").forEach((node) => {
          const key = node.getAttribute("data-i18n");
          if (!key || !dictionary[key]) return;
          const textNode = [...node.childNodes].find((child) => child.nodeType === Node.TEXT_NODE && child.textContent?.trim());
          if (textNode) textNode.textContent = "\\n            " + dictionary[key] + "\\n          ";
          else node.textContent = dictionary[key];
        });
        document.title = (dictionary[${JSON.stringify(title)}] || ${JSON.stringify(title)}) + " | " + ${JSON.stringify(config.appName)};
        document.querySelectorAll("[data-locale]").forEach((button) => button.classList.toggle("active", button.dataset.locale === value));
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const ignored = new Set(["SCRIPT", "STYLE", "CODE", "PRE", "TEXTAREA"]);
        const textNodes = [];
        let current;
        while ((current = walker.nextNode())) {
          if (!ignored.has(current.parentElement?.tagName || "")) textNodes.push(current);
        }
        textNodes.forEach((node) => {
          const original = node.textContent || "";
          const key = original.trim();
          if (key && dictionary[key]) node.textContent = original.replace(key, dictionary[key]);
        });
      }
      applyAdminLocale(locale);
      const currentPath = location.pathname.replace(/\\/$/, "") || "/";
      const navLinks = [...document.querySelectorAll(".shell-nav a")];
      const matches = navLinks
        .map((link) => ({ link, path: new URL(link.href, location.origin).pathname.replace(/\\/$/, "") || "/" }))
        .filter(({ path }) => currentPath === path || (path !== ${JSON.stringify(config.controlPanelPath)} && currentPath.startsWith(path + "/")))
        .sort((left, right) => right.path.length - left.path.length);
      matches[0]?.link.classList.add("active");
      document.querySelectorAll("[data-locale]").forEach((button) => button.addEventListener("click", () => {
        localStorage.setItem("hybrid-static-cms-locale", button.dataset.locale || "en");
        location.reload();
      }));
    </script>
  </body>
</html>`;
}
