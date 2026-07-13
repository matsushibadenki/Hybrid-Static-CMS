import { config } from "./config";
import { escapeHtml } from "./content";
import type { SessionUser } from "./types";

export function adminLayout(title: string, user: SessionUser | null, body: string) {
  const csrfField = user?.csrfToken
    ? `<input type="hidden" name="_csrf" value="${escapeHtml(user.csrfToken)}" />`
    : "";
  const nav = user
    ? `
      <nav class="shell-nav">
        <a href="${config.controlPanelPath}">Dashboard</a>
        <a href="${config.controlPanelPath}/posts">Posts</a>
        <a href="${config.controlPanelPath}/pages">Pages</a>
        <a href="${config.controlPanelPath}/forms">Forms</a>
        <a href="${config.controlPanelPath}/media">Media</a>
        <a href="${config.controlPanelPath}/logs">Logs</a>
        <a href="${config.controlPanelPath}/snapshots">Snapshots</a>
        <a href="${config.controlPanelPath}/posts/new">New post</a>
        <a href="${config.controlPanelPath}/pages/new">New page</a>
        <a href="${config.cmsApiPrefix}/posts">API</a>
        <form method="post" action="/logout">${csrfField}<button type="submit">Logout</button></form>
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
    <style>
      :root {
        --bg: #f5f1e6;
        --panel: rgba(255, 251, 243, 0.94);
        --line: rgba(31, 41, 51, 0.12);
        --ink: #1f2933;
        --muted: #52606d;
        --accent: #b4492c;
        --accent-2: #146356;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        color: var(--ink);
        font-family: "Iowan Old Style", Georgia, serif;
        background:
          radial-gradient(circle at top left, rgba(180, 73, 44, 0.2), transparent 30%),
          radial-gradient(circle at top right, rgba(20, 99, 86, 0.18), transparent 28%),
          linear-gradient(180deg, #fbf8f0 0%, var(--bg) 100%);
      }
      .shell {
        max-width: 1120px;
        margin: 0 auto;
        padding: 24px 16px 64px;
      }
      .shell-header,
      .shell-card {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 28px;
        box-shadow: 0 18px 40px rgba(31, 41, 51, 0.08);
      }
      .shell-header {
        padding: 28px 20px;
        margin-bottom: 20px;
      }
      .shell-card {
        padding: 24px 20px;
      }
      .shell-nav {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 16px;
      }
      .shell-nav a,
      .shell-nav button,
      .button {
        appearance: none;
        border: 1px solid var(--line);
        background: white;
        color: var(--ink);
        border-radius: 999px;
        padding: 10px 14px;
        text-decoration: none;
        cursor: pointer;
        font: inherit;
      }
      .button-primary {
        background: var(--ink);
        color: white;
      }
      h1, h2, h3 { margin-top: 0; }
      p { line-height: 1.65; }
      .grid {
        display: grid;
        gap: 20px;
      }
      .stats {
        display: grid;
        gap: 16px;
      }
      .stat {
        padding: 18px;
        border-radius: 22px;
        background: rgba(255, 255, 255, 0.7);
        border: 1px solid var(--line);
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        padding: 12px 0;
        text-align: left;
        border-bottom: 1px solid var(--line);
        vertical-align: top;
      }
      .form-grid {
        display: grid;
        gap: 16px;
      }
      label {
        display: grid;
        gap: 8px;
        font-weight: 700;
      }
      input, textarea, select {
        width: 100%;
        min-width: 0;
        padding: 12px 14px;
        border-radius: 16px;
        border: 1px solid var(--line);
        background: white;
        color: var(--ink);
        font: inherit;
      }
      textarea { min-height: 180px; resize: vertical; }
      .meta {
        color: var(--muted);
        font-size: 0.92rem;
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }
      @media (min-width: 860px) {
        .grid {
          grid-template-columns: 1.5fr 0.9fr;
        }
        .stats {
          grid-template-columns: repeat(8, 1fr);
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <header class="shell-header">
        <p class="meta">${escapeHtml(config.appName)} control panel</p>
        <h1>${escapeHtml(title)}</h1>
        ${user ? `<p>Signed in as ${escapeHtml(user.displayName)}.</p>` : "<p>Sign in to manage posts and generated fragments.</p>"}
        ${nav}
      </header>
      <section class="shell-card">${protectedBody}</section>
    </main>
  </body>
</html>`;
}
