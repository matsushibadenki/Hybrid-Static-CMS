import path from "node:path";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { config } from "./config";
import { escapeHtml } from "./content";
import { renderFormArtifacts } from "./forms";
import { listPages } from "./pages";
import { listPosts } from "./posts";
import { renderMenuArtifacts } from "./menus";
import { expandPublishedBlocks } from "./blocks";
import { emitHook } from "./hooks";
import type { PageRecord, PostRecord } from "./types";
import { listPostSeriesNavigation, type SeriesNavigation } from "./series";
import { publicTranslations } from "./i18n";
import { postArtifactRelativePath, postPermalinkPath, type PostPermalinkPattern } from "./permalinks";
import { getPostPermalinkPattern } from "./settings";
import { listApprovedCommentsForPosts, type PostCommentRecord } from "./comments";
import { ensurePublicAssetDirectories, stylesheetPublicUrl } from "./assets";

const publicCopy = publicTranslations[config.publicLocale];
const publicDateLocale = config.publicLocale === "zh" ? "zh-CN" : config.publicLocale === "ja" ? "ja-JP" : "en-US";

function publicDate(value: string, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  return new Date(value).toLocaleDateString(publicDateLocale, options);
}

type SeoMeta = {
  title: string;
  description?: string;
  canonicalUrl?: string;
  jsonLd?: string;
  robots?: string;
  ogImage?: string;
  keywords?: string;
};

function safeJsonLd(value: string) {
  return value.replaceAll("</script>", "<\\/script>");
}

function googleFontLinks() {
  const urls = config.googleFontsCssUrls.filter((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com");
    } catch {
      return false;
    }
  });

  return `
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    ${urls.map((url) => `<link rel="stylesheet" href="${escapeHtml(url)}" />`).join("\n    ")}
  `;
}

function pagePublicPath(slug: string) {
  return `/cms/pages/${slug}.html`;
}

async function writeArtifact(filePath: string, content: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryPath, content, "utf8");
    await rename(temporaryPath, filePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

function card(post: PostRecord, variant: "lead" | "compact" = "compact", permalinkPattern: PostPermalinkPattern = "post_name") {
  const href = postPermalinkPath(post, permalinkPattern);
  return `
    <article class="hybrid-static-cms-card magazine-card magazine-card--${variant}">
      <div class="hybrid-static-cms-card__meta">
        <span>${escapeHtml(post.publishedAt ? publicDate(post.publishedAt) : publicCopy.draft)}</span>
        ${post.categories[0] ? `<span>${escapeHtml(post.categories[0])}</span>` : ""}
      </div>
      <h3 class="magazine-card__title"><a href="${href}">${escapeHtml(post.title)}</a></h3>
      ${post.excerpt ? `<p>${escapeHtml(post.excerpt)}</p>` : ""}
      <a class="magazine-card__read" href="${href}">${publicCopy.readStory} <span aria-hidden="true">↗</span></a>
    </article>
  `;
}

function pageTemplate(meta: SeoMeta, body: string, stylesheetUrls: string[] = []) {
  const description = meta.description ? `<meta name="description" content="${escapeHtml(meta.description)}" />` : "";
  const canonical = meta.canonicalUrl ? `<link rel="canonical" href="${escapeHtml(meta.canonicalUrl)}" />` : "";
  const ogTitle = `<meta property="og:title" content="${escapeHtml(meta.title)}" />`;
  const ogDescription = meta.description
    ? `<meta property="og:description" content="${escapeHtml(meta.description)}" />`
    : "";
  const ogType = `<meta property="og:type" content="website" />`;
  const ogUrl = meta.canonicalUrl ? `<meta property="og:url" content="${escapeHtml(meta.canonicalUrl)}" />` : "";
  const ogImage = meta.ogImage ? `<meta property="og:image" content="${escapeHtml(meta.ogImage)}" />` : "";
  const keywords = meta.keywords ? `<meta name="keywords" content="${escapeHtml(meta.keywords)}" />` : "";
  const jsonLd = meta.jsonLd ? `<script type="application/ld+json">${safeJsonLd(meta.jsonLd)}</script>` : "";
  const robots = meta.robots ? `<meta name="robots" content="${escapeHtml(meta.robots)}" />` : "";
  const stylesheets = [...new Set(stylesheetUrls)]
    .map((url) => `<link rel="stylesheet" href="${escapeHtml(url)}" />`)
    .join("\n    ");
  const fallback = `<!doctype html>
<html lang="${config.publicLocale === "zh" ? "zh-CN" : config.publicLocale}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(meta.title)}</title>
    ${description}
    ${canonical}
    ${ogTitle}
    ${ogDescription}
    ${ogType}
    ${ogUrl}
    ${ogImage}
    ${keywords}
    ${robots}
    ${jsonLd}
    ${googleFontLinks()}
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <script>
      window.MathJax = {
        tex: {
          inlineMath: [["\\\\(", "\\\\)"]],
          displayMath: [["\\\\[", "\\\\]"], ["$$", "$$"]],
          processEscapes: true
        },
        svg: { fontCache: "global" }
      };
    </script>
    <script async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
    <script defer>
      document.addEventListener("DOMContentLoaded", function () {
        document.querySelectorAll("pre code.language-mermaid").forEach(function (code) {
          var chart = document.createElement("div");
          chart.className = "mermaid";
          chart.textContent = code.textContent || "";
          if (code.parentElement) code.parentElement.replaceWith(chart);
        });
        if (window.mermaid) {
          window.mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral" });
          window.mermaid.run();
        }
      });
    </script>
    <style>
      /* ========================================
         note.com-inspired Public Page Design
         Clean, minimal, reading-focused
         ======================================== */

      :root {
        --bg: #ffffff;
        --panel: #ffffff;
        --ink: #333333;
        --on-ink: #ffffff;
        --ink-secondary: #555555;
        --muted: #999999;
        --line: #ebebeb;
        --line-light: #f5f5f5;
        --accent: #41C9B4;
        --accent-hover: #35b5a2;
        --accent-light: rgba(65, 201, 180, 0.08);
        --radius-sm: 6px;
        --radius-md: 10px;
        --radius-pill: 100px;
        --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.04);
        --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.06);
        --transition: 0.18s ease;
        --font-sans: 'Inter', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }

      *, *::before, *::after { box-sizing: border-box; }

      body {
        margin: 0;
        background: var(--bg);
        color: var(--ink);
        font-family: var(--font-sans);
        font-size: 15px;
        line-height: 1.8;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      /* ---- Site Header ---- */

      .magazine-masthead {
        border-bottom: 1px solid var(--line);
        padding: 0 24px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        height: 56px;
        max-width: 100%;
      }

      .magazine-masthead__name {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--ink);
        font-family: var(--font-sans);
        font-size: 0.95rem;
        font-weight: 600;
        letter-spacing: -0.01em;
        text-decoration: none;
        text-transform: none;
      }

      .magazine-masthead__name::before {
        content: '';
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--accent);
        flex-shrink: 0;
      }

      .magazine-masthead__issue {
        color: var(--muted);
        font-family: var(--font-sans);
        font-size: 0.8rem;
        font-weight: 400;
        letter-spacing: 0;
        text-transform: none;
      }

      .magazine-rule { display: none; }

      /* ---- Shell / Main ---- */

      main.magazine-shell {
        max-width: 780px;
        margin: 0 auto;
        padding: 0 24px 64px;
      }

      /* ---- Footer ---- */

      .magazine-footer {
        border-top: 1px solid var(--line);
        color: var(--muted);
        font-family: var(--font-sans);
        font-size: 0.8rem;
        font-weight: 400;
        letter-spacing: 0;
        margin-top: 48px;
        padding-top: 20px;
        text-transform: none;
        text-align: center;
      }

      /* ---- Page Header (list pages) ---- */

      .magazine-page-header {
        display: block;
        margin: 40px 0 32px;
      }

      .magazine-page-header__eyebrow,
      .magazine-kicker {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin: 0 0 12px;
        padding: 4px 12px;
        border-radius: var(--radius-pill);
        background: var(--accent-light);
        color: var(--accent-hover);
        font-family: var(--font-sans);
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.02em;
        text-transform: none;
      }

      .magazine-page-header__title {
        font-family: var(--font-sans);
        font-size: clamp(1.6rem, 4vw, 2.2rem);
        font-weight: 700;
        letter-spacing: -0.02em;
        line-height: 1.25;
        margin: 0 0 8px;
        color: var(--ink);
      }

      .magazine-page-header__deck {
        color: var(--ink-secondary);
        font-size: 1rem;
        line-height: 1.7;
        margin: 0;
        max-width: 520px;
      }

      /* ---- Card Index (post / page list) ---- */

      .hybrid-static-cms-list.magazine-index {
        display: grid;
        grid-template-columns: 1fr;
        gap: 0;
      }

      .magazine-card {
        border-top: none;
        border-bottom: 1px solid var(--line);
        padding: 20px 0;
        transition: background var(--transition);
      }

      .magazine-card:last-child {
        border-bottom: none;
      }

      .magazine-card--lead {
        grid-column: auto;
        grid-row: auto;
        border-top: none;
        border-bottom: 1px solid var(--line);
        padding: 24px 0;
      }

      .magazine-card--compact {
        grid-column: auto;
        display: block;
      }

      .hybrid-static-cms-card__meta {
        display: flex;
        gap: 10px;
        color: var(--muted);
        font-family: var(--font-sans);
        font-size: 0.78rem;
        font-weight: 400;
        letter-spacing: 0;
        margin-bottom: 8px;
        text-transform: none;
      }

      .hybrid-static-cms-card__meta span + span {
        color: var(--accent);
        font-weight: 500;
      }

      .magazine-card__title {
        font-family: var(--font-sans);
        font-size: 1.15rem;
        font-weight: 600;
        letter-spacing: -0.01em;
        line-height: 1.4;
        margin: 0;
      }

      .magazine-card--lead .magazine-card__title {
        font-size: 1.4rem;
        line-height: 1.3;
      }

      .magazine-card p {
        color: var(--ink-secondary);
        font-size: 0.9rem;
        line-height: 1.65;
        margin: 8px 0 12px;
        max-width: none;
      }

      a {
        color: var(--accent);
        text-decoration: none;
        text-decoration-thickness: initial;
        text-underline-offset: initial;
        transition: color var(--transition);
      }

      a:hover { color: var(--accent-hover); }

      .magazine-card__title a {
        color: var(--ink);
      }

      .magazine-card__title a:hover {
        color: var(--accent);
      }

      .magazine-card__read {
        align-self: auto;
        color: var(--accent);
        font-family: var(--font-sans);
        font-size: 0.82rem;
        font-weight: 500;
        letter-spacing: 0;
        text-transform: none;
        white-space: nowrap;
      }

      .magazine-card__read span { font-size: 0.9em; margin-left: 2px; }

      .magazine-card__read:hover {
        color: var(--accent-hover);
      }

      .magazine-pagination {
        border-top: 1px solid var(--line);
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 24px;
        padding-top: 16px;
      }

      .magazine-pagination a {
        font-family: var(--font-sans);
        font-size: 0.82rem;
        font-weight: 500;
        letter-spacing: 0;
        text-transform: none;
        padding: 4px 12px;
        border-radius: var(--radius-pill);
        background: var(--line-light);
        color: var(--ink-secondary);
        transition: all var(--transition);
      }

      .magazine-pagination a:hover {
        background: var(--accent-light);
        color: var(--accent);
      }

      /* ---- Article Prose (single post / page) ---- */

      .hybrid-static-cms-page,
      .hybrid-static-cms-prose,
      .magazine-prose {
        max-width: none;
      }

      .magazine-prose { line-height: 1.8; }

      .magazine-prose__header {
        border-bottom: 1px solid var(--line);
        margin: 40px 0 32px;
        padding-bottom: 24px;
      }

      .magazine-prose__title {
        font-family: var(--font-sans);
        font-size: clamp(1.6rem, 5vw, 2.4rem);
        font-weight: 700;
        letter-spacing: -0.02em;
        line-height: 1.25;
        margin: 8px 0 12px;
        color: var(--ink);
      }

      .magazine-prose__deck {
        color: var(--ink-secondary);
        font-size: 1.05rem;
        line-height: 1.7;
        max-width: 560px;
      }

      .magazine-prose__body {
        font-size: 1rem;
        max-width: none;
        line-height: 1.85;
        color: var(--ink);
      }

      .series-pager {
        border-top: 1px solid var(--line);
        margin-top: 48px;
        padding-top: 24px;
      }

      .series-pager__header {
        align-items: end;
        display: flex;
        gap: 16px;
        justify-content: space-between;
        margin-bottom: 18px;
      }

      .series-pager__label {
        color: var(--accent);
        font-family: var(--font-sans);
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        margin: 0 0 4px;
        text-transform: uppercase;
      }

      .series-pager__title { font-size: 1.15rem; margin: 0; }
      .series-pager__position { color: var(--ink-muted); font-size: 0.82rem; white-space: nowrap; }
      .series-pager__steps { display: grid; gap: 14px; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); }
      .series-pager__direction {
        border: 1px solid var(--line);
        color: var(--ink);
        display: grid;
        gap: 3px;
        min-width: 0;
        padding: 12px 14px;
      }
      .series-pager__direction--next { text-align: right; }
      .series-pager__direction-label { color: var(--ink-muted); font-size: 0.72rem; }
      .series-pager__direction-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .series-pager__direction--disabled { border-color: transparent; }
      .series-pager__pages { align-items: center; display: flex; gap: 5px; list-style: none; margin: 0; padding: 0; }
      .series-pager__pages a, .series-pager__pages span {
        align-items: center;
        display: inline-flex;
        font-size: 0.78rem;
        height: 30px;
        justify-content: center;
        min-width: 30px;
        padding: 0 7px;
      }
      .series-pager__pages a { background: var(--line-light); color: var(--ink-secondary); }
      .series-pager__pages a:hover { background: var(--accent-light); color: var(--accent); }
      .series-pager__pages [aria-current="page"] { background: var(--ink); color: var(--on-ink); font-weight: 700; }

      @media (max-width: 720px) {
        .series-pager__steps { grid-template-columns: 1fr 1fr; }
        .series-pager__pages { grid-column: 1 / -1; grid-row: 2; justify-content: center; }
      }

      .magazine-prose__body h1,
      .magazine-prose__body h2,
      .magazine-prose__body h3,
      .magazine-prose__body h4 {
        font-family: var(--font-sans);
        letter-spacing: -0.02em;
        line-height: 1.3;
        margin: 2em 0 0.6em;
        color: var(--ink);
      }

      .magazine-prose__body h1 { font-size: 1.7rem; font-weight: 700; }
      .magazine-prose__body h2 { font-size: 1.4rem; font-weight: 700; }
      .magazine-prose__body h3 { font-size: 1.15rem; font-weight: 600; }
      .magazine-prose__body h4 {
        color: var(--accent-hover);
        font-family: var(--font-sans);
        font-size: 0.92rem;
        font-weight: 600;
        letter-spacing: 0;
        text-transform: none;
      }

      .magazine-prose__body blockquote {
        border-left: 3px solid var(--accent);
        color: var(--ink-secondary);
        font-size: 1.05rem;
        font-style: italic;
        margin: 1.8em 0;
        padding: 4px 0 4px 20px;
      }

      .magazine-prose__body ul, .magazine-prose__body ol { padding-left: 1.4em; }
      .magazine-prose__body li + li { margin-top: 0.4em; }

      .magazine-prose__body pre {
        background: #1e1e1e;
        border-radius: var(--radius-sm);
        color: #e5e5e5;
        overflow-x: auto;
        padding: 18px 20px;
        font-size: 0.88rem;
        line-height: 1.5;
        border: none;
      }

      .magazine-prose__body .mermaid {
        background: var(--line-light);
        border: 1px solid var(--line);
        border-radius: var(--radius-md);
        margin: 1.5em 0;
        overflow-x: auto;
        padding: 20px;
      }

      .magazine-prose__body code {
        font-family: 'SF Mono', 'Fira Code', 'Noto Sans Mono', 'SFMono-Regular', Consolas, monospace;
        font-size: 0.88em;
      }

      .magazine-prose__body mjx-container { max-width: 100%; overflow-x: auto; overflow-y: hidden; }

      .magazine-prose__body :not(pre) > code {
        background: var(--line-light);
        border-radius: 4px;
        padding: 2px 6px;
        color: var(--ink);
      }

      .magazine-prose__body hr {
        border: 0;
        border-top: 1px solid var(--line);
        margin: 2.5em 0;
      }

      .magazine-prose__body img,
      .magazine-prose__body video,
      .magazine-prose__body audio {
        display: block;
        max-width: 100%;
        margin: 1.5em 0;
        border-radius: var(--radius-sm);
      }

      .magazine-prose__body img { height: auto; }

      .align-left { text-align: left; }
      .align-center { text-align: center; }
      .align-right { text-align: right; }
      .align-justify { text-align: justify; }
      .magazine-prose__body .text-size-small { font-size: .82em; }
      .magazine-prose__body .text-size-normal { font-size: 1em; }
      .magazine-prose__body .text-size-large { font-size: 1.25em; }
      .magazine-prose__body .text-size-xlarge { font-size: 1.6em; }
      .magazine-prose__body ruby { ruby-position: over; }
      .magazine-prose__body rt { color: var(--accent-hover); font-family: var(--font-sans); font-size: .48em; letter-spacing: .04em; }
      .post-comments { border-top: 1px solid var(--line); margin-top: 48px; padding-top: 28px; }
      .post-comments__title { font-size: 1.2rem; margin: 0 0 20px; }
      .post-comments__list { display: grid; gap: 18px; list-style: none; margin: 0 0 28px; padding: 0; }
      .post-comment { border-bottom: 1px solid var(--line); padding-bottom: 18px; }
      .post-comment__meta { color: var(--muted); font-size: .78rem; margin: 0 0 6px; }
      .post-comment__body { margin: 0; white-space: pre-wrap; }
      .post-comment-form { background: var(--line-light); display: grid; gap: 14px; padding: 20px; }
      .post-comment-form label { display: grid; font-size: .82rem; font-weight: 600; gap: 6px; }
      .post-comment-form input, .post-comment-form textarea { background: var(--panel); border: 1px solid var(--line); color: var(--ink); font: inherit; padding: 10px 12px; width: 100%; }
      .post-comment-form textarea { min-height: 120px; resize: vertical; }
      .post-comment-form button { background: var(--ink); border: 0; color: var(--on-ink); cursor: pointer; font: inherit; justify-self: start; padding: 10px 18px; }
      .post-comments__closed, .post-comments__empty, .post-comment-form__note { color: var(--muted); font-size: .82rem; }
      .material-symbols-outlined { font-family: "Material Symbols Outlined"; font-weight: normal; font-style: normal; font-size: 1.2em; line-height: 1; letter-spacing: normal; text-transform: none; display: inline-block; white-space: nowrap; word-wrap: normal; direction: ltr; font-feature-settings: "liga"; -webkit-font-feature-settings: "liga"; -webkit-font-smoothing: antialiased; }
      .magazine-empty { border-top: 1px solid var(--line); color: var(--muted); padding-top: 20px; }

      /* ---- Responsive ---- */

      @media (max-width: 640px) {
        main.magazine-shell { padding: 0 16px 40px; }
        .magazine-masthead { padding: 0 16px; height: 48px; }
        .magazine-page-header { margin: 28px 0 24px; }
        .magazine-prose__header { margin: 28px 0 24px; }
      }

      /* ---- Scrollbar ---- */

      ::-webkit-scrollbar { width: 6px; height: 6px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: #ddd; border-radius: 3px; }
      ::-webkit-scrollbar-thumb:hover { background: #bbb; }
    </style>
    ${stylesheets}
  </head>
  <body>
    <main class="magazine-shell">
      <header class="magazine-masthead">
        <a class="magazine-masthead__name" href="${escapeHtml(config.appUrl)}/">${escapeHtml(config.appName)}</a>
        <span class="magazine-masthead__issue">${new Date().getFullYear()}</span>
      </header>
      <div class="magazine-rule"></div>
      ${body}
      <footer class="magazine-footer">${escapeHtml(config.appName)} · ${publicCopy.builtWith}</footer>
    </main>
  </body>
</html>`;
  try {
    const template = readFileSync(path.join(config.templateDir, "page.html"), "utf8");
    const hasStylesheetSlot = template.includes("{{stylesheets}}");
    const rendered = template
      .replaceAll("{{lang}}", config.publicLocale === "zh" ? "zh-CN" : config.publicLocale)
      .replaceAll("{{title}}", escapeHtml(meta.title))
      .replaceAll("{{description}}", description)
      .replaceAll("{{canonical}}", canonical)
      .replaceAll("{{ogTitle}}", ogTitle)
      .replaceAll("{{ogDescription}}", ogDescription)
      .replaceAll("{{ogType}}", ogType)
      .replaceAll("{{ogUrl}}", ogUrl)
      .replaceAll("{{ogImage}}", ogImage)
      .replaceAll("{{keywords}}", keywords)
      .replaceAll("{{robots}}", robots)
      .replaceAll("{{jsonLd}}", jsonLd)
      .replaceAll("{{stylesheets}}", stylesheets)
      .replaceAll("{{body}}", body);
    return hasStylesheetSlot || !stylesheets
      ? rendered
      : rendered.replace("</head>", `    ${stylesheets}\n  </head>`);
  } catch {
    return fallback;
  }
}

function renderList(title: string, posts: PostRecord[], pagination?: { page: number; totalPages: number }, permalinkPattern: PostPermalinkPattern = "post_name") {
  const cards = posts.map((post, index) => card(post, index === 0 ? "lead" : "compact", permalinkPattern)).join("");
  const pager =
    pagination && pagination.totalPages > 1
      ? `<nav class="magazine-pagination" aria-label="${publicCopy.postPages}">${Array.from({ length: pagination.totalPages }, (_, index) => {
          const page = index + 1;
          return `<a href="/cms/posts/page/${page}.html">${publicCopy.page} ${page}</a>`;
        }).join("")}</nav>`
      : "";

  return pageTemplate(
    {
      title,
      description: `${publicCopy.posts} - ${config.appName}`,
      canonicalUrl: `${config.appUrl}/cms/posts/list.html`,
    },
    `<header class="magazine-page-header">
      <div><p class="magazine-page-header__eyebrow">${publicCopy.editorialIndex}</p></div>
      <div><h1 class="magazine-page-header__title">${escapeHtml(title)}</h1><p class="magazine-page-header__deck">${publicCopy.postIndexDescription} · ${escapeHtml(config.appName)}</p></div>
    </header>
    <section class="hybrid-static-cms-list magazine-index">${cards || `<p class="magazine-empty">${publicCopy.noPosts}</p>`}</section>${pager}`,
  );
}

function renderFragment(posts: PostRecord[], permalinkPattern: PostPermalinkPattern = "post_name") {
  if (posts.length === 0) {
    return `<div class="hybrid-static-cms-fragment"><p>${publicCopy.noPosts}</p></div>`;
  }

  return `<div class="hybrid-static-cms-fragment magazine-index">${posts.map((post) => card(post, "compact", permalinkPattern)).join("")}</div>`;
}

export async function renderPage(page: PageRecord) {
  const expandedBody = await expandPublishedBlocks(page.bodyHtml);
  const canonicalUrl = page.seoCanonicalUrl || `${config.appUrl}${pagePublicPath(page.slug)}`;
  const robots = [page.seoNoindex ? "noindex" : "index", page.seoNofollow ? "nofollow" : "follow"].join(", ");
  const stylesheetUrl = stylesheetPublicUrl(page.stylesheetPath, "pages");
  return pageTemplate(
    {
      title: page.seoTitle || page.title,
      description: page.seoDescription || page.excerpt || undefined,
      canonicalUrl,
      ogImage: page.seoOgImage || undefined,
      keywords: page.seoKeywords || undefined,
      robots,
      jsonLd: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: page.title,
        description: page.seoDescription || page.excerpt || undefined,
        url: canonicalUrl,
        keywords: page.seoKeywords || undefined,
        dateModified: page.updatedAt,
      }),
    },
    `
      <article class="hybrid-static-cms-page magazine-prose">
        <header class="magazine-prose__header">
          <p class="magazine-kicker">${publicCopy.managedPage}</p>
          <h1 class="magazine-prose__title">${escapeHtml(page.title)}</h1>
          ${page.excerpt ? `<p class="magazine-prose__deck">${escapeHtml(page.excerpt)}</p>` : ""}
        </header>
        <div class="magazine-prose__body">${expandedBody}</div>
      </article>
    `,
    stylesheetUrl ? [stylesheetUrl] : [],
  );
}

function renderPageIndex(pages: PageRecord[]) {
  const cards = pages
    .map(
      (page) => `
        <article class="hybrid-static-cms-card magazine-card magazine-card--compact">
          <div class="hybrid-static-cms-card__meta">
            <span>${escapeHtml(page.publishedAt ? publicDate(page.publishedAt) : publicCopy.draft)}</span>
          </div>
          <h3 class="magazine-card__title"><a href="${pagePublicPath(page.slug)}">${escapeHtml(page.title)}</a></h3>
          ${page.excerpt ? `<p>${escapeHtml(page.excerpt)}</p>` : ""}
          <a class="magazine-card__read" href="${pagePublicPath(page.slug)}">${publicCopy.openPage} <span aria-hidden="true">↗</span></a>
        </article>
      `,
    )
    .join("");

  return pageTemplate(
    {
      title: publicCopy.pages,
      description: `${publicCopy.pages} - ${config.appName}`,
      canonicalUrl: `${config.appUrl}/cms/pages/index.html`,
    },
    `<header class="magazine-page-header">
      <div><p class="magazine-page-header__eyebrow">${publicCopy.staticDesk}</p></div>
      <div><h1 class="magazine-page-header__title">${publicCopy.pages}</h1><p class="magazine-page-header__deck">${publicCopy.pageIndexDescription} ${escapeHtml(config.appName)}</p></div>
    </header>
    <section class="hybrid-static-cms-list magazine-index">${cards || `<p class="magazine-empty">${publicCopy.noPages}</p>`}</section>`,
  );
}

function renderSeriesPagination(post: PostRecord, series: SeriesNavigation | null, permalinkPattern: PostPermalinkPattern) {
  if (!series || series.posts.length < 2) return "";
  const currentIndex = series.posts.findIndex((item) => item.id === post.id);
  if (currentIndex < 0) return "";
  const previous = series.posts[currentIndex - 1];
  const next = series.posts[currentIndex + 1];
  const visibleIndexes = new Set([0, series.posts.length - 1]);
  for (let index = Math.max(0, currentIndex - 2); index <= Math.min(series.posts.length - 1, currentIndex + 2); index += 1) {
    visibleIndexes.add(index);
  }
  const indexes = [...visibleIndexes].sort((left, right) => left - right);
  let lastIndex = -1;
  const pages = indexes.map((index) => {
    const gap = lastIndex >= 0 && index - lastIndex > 1 ? `<li><span aria-hidden="true">…</span></li>` : "";
    lastIndex = index;
    const item = series.posts[index];
    const page = index + 1;
    const control = index === currentIndex
      ? `<span aria-current="page" aria-label="${publicCopy.currentArticle}: ${escapeHtml(item.title)}">${page}</span>`
      : `<a href="${postPermalinkPath(item, permalinkPattern)}" aria-label="${publicCopy.openArticle} ${page}: ${escapeHtml(item.title)}" title="${escapeHtml(item.title)}">${page}</a>`;
    return `${gap}<li>${control}</li>`;
  }).join("");
  const previousControl = previous
    ? `<a class="series-pager__direction" href="${postPermalinkPath(previous, permalinkPattern)}"><span class="series-pager__direction-label">← ${publicCopy.previous}</span><span class="series-pager__direction-title">${escapeHtml(previous.title)}</span></a>`
    : `<span class="series-pager__direction series-pager__direction--disabled" aria-hidden="true"></span>`;
  const nextControl = next
    ? `<a class="series-pager__direction series-pager__direction--next" href="${postPermalinkPath(next, permalinkPattern)}"><span class="series-pager__direction-label">${publicCopy.next} →</span><span class="series-pager__direction-title">${escapeHtml(next.title)}</span></a>`
    : `<span class="series-pager__direction series-pager__direction--disabled" aria-hidden="true"></span>`;
  return `
    <nav class="series-pager" aria-label="${publicCopy.seriesNavigation}">
      <header class="series-pager__header">
        <div><p class="series-pager__label">${publicCopy.series}</p><h2 class="series-pager__title">${escapeHtml(series.title)}</h2></div>
        <span class="series-pager__position">${currentIndex + 1} / ${series.posts.length}</span>
      </header>
      <div class="series-pager__steps">
        ${previousControl}
        <ol class="series-pager__pages">${pages}</ol>
        ${nextControl}
      </div>
    </nav>`;
}

function renderCommentSection(post: PostRecord, comments: PostCommentRecord[]) {
  const commentsHtml = comments.length > 0
    ? `<ol class="post-comments__list">${comments.map((comment) => `<li class="post-comment"><p class="post-comment__meta"><strong>${escapeHtml(comment.authorName)}</strong> · ${escapeHtml(publicDate(comment.createdAt))}</p><p class="post-comment__body">${escapeHtml(comment.body)}</p></li>`).join("")}</ol>`
    : `<p class="post-comments__empty">${escapeHtml(publicCopy.noComments)}</p>`;
  if (!post.commentsEnabled) {
    return `<section class="post-comments" id="comments"><h2 class="post-comments__title">${escapeHtml(publicCopy.comments)}</h2>${commentsHtml}<p class="post-comments__closed">${escapeHtml(publicCopy.commentsClosed)}</p></section>`;
  }
  const recaptchaAction = `comment_submit_${post.id}`;
  const recaptchaMarkup = config.recaptchaSiteKey && config.recaptchaSecretKey
    ? `<input type="hidden" name="recaptchaToken" value="" />
      <script src="https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(config.recaptchaSiteKey)}"></script>
      <script>(()=>{const form=document.currentScript?.closest(".post-comments")?.querySelector("form");if(!form||!window.grecaptcha)return;const field=form.querySelector('input[name="recaptchaToken"]');let submitting=false;form.addEventListener("submit",async(event)=>{if(submitting)return;event.preventDefault();submitting=true;const button=form.querySelector('button[type="submit"]');if(button)button.disabled=true;try{const token=await new Promise((resolve,reject)=>window.grecaptcha.ready(()=>window.grecaptcha.execute(${JSON.stringify(config.recaptchaSiteKey)},{action:${JSON.stringify(recaptchaAction)}}).then(resolve).catch(reject)));if(field)field.value=token;form.submit();}catch{ submitting=false;if(button)button.disabled=false;}});})();</script>`
    : "";
  return `<section class="post-comments" id="comments"><h2 class="post-comments__title">${escapeHtml(publicCopy.comments)}</h2>${commentsHtml}<form class="post-comment-form" method="post" action="${config.cmsApiPrefix}/comments/${post.id}/submit"><label>${escapeHtml(publicCopy.commentName)}<input name="authorName" maxlength="80" autocomplete="name" required /></label><label>${escapeHtml(publicCopy.commentEmail)}<input type="email" name="authorEmail" maxlength="254" autocomplete="email" required /></label><label>${escapeHtml(publicCopy.commentBody)}<textarea name="body" maxlength="4000" required></textarea></label>${recaptchaMarkup}<p class="post-comment-form__note">${escapeHtml(publicCopy.commentModerationNote)}</p><button type="submit">${escapeHtml(publicCopy.submitComment)}</button></form></section>`;
}

export function renderPost(post: PostRecord, series: SeriesNavigation | null = null, permalinkPattern: PostPermalinkPattern = "post_name", comments: PostCommentRecord[] = []) {
  const canonicalUrl = post.seoCanonicalUrl || `${config.appUrl}${postPermalinkPath(post, permalinkPattern)}`;
  const robots = [post.seoNoindex ? "noindex" : "index", post.seoNofollow ? "nofollow" : "follow"].join(", ");
  const stylesheetUrls = post.categoryStylesheets
    .map((stylesheet) => stylesheetPublicUrl(stylesheet, "categories"))
    .filter((url): url is string => Boolean(url));
  return pageTemplate(
    {
      title: post.seoTitle || post.title,
      description: post.seoDescription || post.excerpt || undefined,
      canonicalUrl,
      ogImage: post.seoOgImage || undefined,
      keywords: post.seoKeywords || undefined,
      robots,
      jsonLd: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Article",
        headline: post.title,
        description: post.seoDescription || post.excerpt || undefined,
        datePublished: post.publishedAt || undefined,
        dateModified: post.updatedAt,
        author: post.authorName ? { "@type": "Person", name: post.authorName } : undefined,
        keywords: [...post.categories, ...post.tags].join(", "),
        url: canonicalUrl,
      }),
    },
    `
      <article class="hybrid-static-cms-prose magazine-prose">
        <header class="magazine-prose__header">
        <p class="magazine-kicker">
          ${escapeHtml(post.publishedAt ? publicDate(post.publishedAt) : publicCopy.draft)}
          ${post.authorName ? ` · ${publicCopy.by} ${escapeHtml(post.authorName)}` : ""}
        </p>
        <h1 class="magazine-prose__title">${escapeHtml(post.title)}</h1>
        ${post.excerpt ? `<p class="magazine-prose__deck">${escapeHtml(post.excerpt)}</p>` : ""}
        </header>
        <div class="magazine-prose__body">${post.bodyHtml}</div>
        ${renderSeriesPagination(post, series, permalinkPattern)}
        ${renderCommentSection(post, comments)}
      </article>
    `,
    stylesheetUrls,
  );
}

function renderRss(posts: PostRecord[], permalinkPattern: PostPermalinkPattern) {
  const items = posts
    .map(
      (post) => `
      <item>
        <title>${escapeHtml(post.title)}</title>
        <link>${escapeHtml(post.seoCanonicalUrl || config.appUrl + postPermalinkPath(post, permalinkPattern))}</link>
        <guid>${escapeHtml(post.seoCanonicalUrl || config.appUrl + postPermalinkPath(post, permalinkPattern))}</guid>
        <description>${escapeHtml(post.excerpt ?? "")}</description>
        <pubDate>${post.publishedAt ? new Date(post.publishedAt).toUTCString() : new Date().toUTCString()}</pubDate>
      </item>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeHtml(config.appName)}</title>
    <link>${config.appUrl}</link>
    <description>${escapeHtml(config.appName)} feed</description>
    ${items}
  </channel>
</rss>`;
}

function renderSitemap(posts: PostRecord[], pages: PageRecord[], permalinkPattern: PostPermalinkPattern) {
  const postItems = posts.filter((post) => !post.seoNoindex).map((post) => {
    const lastmod = post.updatedAt ? new Date(post.updatedAt).toISOString() : new Date().toISOString();
    return `<url><loc>${escapeHtml(post.seoCanonicalUrl || config.appUrl + postPermalinkPath(post, permalinkPattern))}</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq></url>`;
  });
  const pageItems = pages.filter((page) => !page.seoNoindex).map((page) => {
    const lastmod = page.updatedAt ? new Date(page.updatedAt).toISOString() : new Date().toISOString();
    return `<url><loc>${escapeHtml(page.seoCanonicalUrl || config.appUrl + pagePublicPath(page.slug))}</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq></url>`;
  });
  const items = [...postItems, ...pageItems]
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${config.appUrl}</loc></url>
  ${items}
</urlset>`;
}

function renderRobotsTxt() {
  return `# Hybrid-Static-CMS robots policy
# Public site content may be crawled, indexed, and used by AI systems
# except for explicitly restricted operational paths.

User-agent: *
Allow: /
Disallow: /login
Disallow: /logout
Disallow: ${config.controlPanelPath}
Disallow: ${config.cmsApiPrefix}

User-agent: GPTBot
Allow: /
Disallow: /login
Disallow: /logout
Disallow: ${config.controlPanelPath}
Disallow: ${config.cmsApiPrefix}

User-agent: ChatGPT-User
Allow: /
Disallow: /login
Disallow: /logout
Disallow: ${config.controlPanelPath}
Disallow: ${config.cmsApiPrefix}

User-agent: ClaudeBot
Allow: /
Disallow: /login
Disallow: /logout
Disallow: ${config.controlPanelPath}
Disallow: ${config.cmsApiPrefix}

User-agent: Claude-Web
Allow: /
Disallow: /login
Disallow: /logout
Disallow: ${config.controlPanelPath}
Disallow: ${config.cmsApiPrefix}

User-agent: PerplexityBot
Allow: /
Disallow: /login
Disallow: /logout
Disallow: ${config.controlPanelPath}
Disallow: ${config.cmsApiPrefix}

User-agent: Google-Extended
Allow: /
Disallow: /login
Disallow: /logout
Disallow: ${config.controlPanelPath}
Disallow: ${config.cmsApiPrefix}

Sitemap: ${config.appUrl}/sitemap.xml
`;
}

function renderLlmsTxt(posts: PostRecord[], pages: PageRecord[], permalinkPattern: PostPermalinkPattern) {
  const visiblePosts = posts.filter((post) => !post.seoNoindex).slice(0, 20);
  const visiblePages = pages.filter((page) => !page.seoNoindex).slice(0, 20);

  const postLinks = visiblePosts.map((post) => `- ${post.title}: ${config.appUrl}${postPermalinkPath(post, permalinkPattern)}`).join("\n");
  const pageLinks = visiblePages.map((page) => `- ${page.title}: ${config.appUrl}${pagePublicPath(page.slug)}`).join("\n");

  return `# ${config.appName}

> ${config.appName} is a public_html coexistence CMS. Public content may be read, summarized, indexed, and used for AI training unless it is explicitly restricted.

## AI access policy

- Public site pages and generated CMS pages may be accessed and used for AI retrieval, summarization, and training.
- Administrative, authenticated, and operational paths must not be used for indexing or training.
- Respect per-page noindex and nofollow directives emitted in generated HTML.
- Prefer canonical URLs and sitemap entries when selecting source pages.

## Preferred public starting points

- Home: ${config.appUrl}/
- Sitemap: ${config.appUrl}/sitemap.xml
- Robots: ${config.appUrl}/robots.txt
- Latest posts fragment: ${config.appUrl}/cms/posts/latest.html
- Post index: ${config.appUrl}/cms/posts/list.html
- CMS pages index: ${config.appUrl}/cms/pages/index.html
- RSS feed: ${config.appUrl}/cms/posts/rss.xml

## Public post URLs

${postLinks || "- No published post URLs are currently available."}

## Public page URLs

${pageLinks || "- No published page URLs are currently available."}

## Restricted URLs

- ${config.appUrl}/login
- ${config.appUrl}/logout
- ${config.appUrl}${config.controlPanelPath}
- ${config.appUrl}${config.cmsApiPrefix}

## Notes for agents

- This project intentionally keeps legacy public_html content and CMS-generated content side by side.
- Generated outputs under /cms/ are the safest machine-readable entry points.
- Do not attempt authenticated crawling or interaction with the control panel.
`;
}

export function renderEmbedScript(permalinkPattern: PostPermalinkPattern = "post_name") {
  return `(() => {
  const nodes = document.querySelectorAll("[data-hybrid-static-cms-posts]");
  if (!nodes.length) return;
  const permalinkPattern = ${JSON.stringify(permalinkPattern)};
  const postPath = (post) => {
    const slug = encodeURIComponent(String(post.slug || ""));
    if (permalinkPattern === "numeric") return "/cms/posts/" + encodeURIComponent(String(post.id)) + ".html";
    if (permalinkPattern === "category") {
      const category = encodeURIComponent(String(post.categories?.[0] || "uncategorized"));
      return "/cms/posts/category/" + category + "/" + slug + ".html";
    }
    if (permalinkPattern === "year_month") {
      const date = new Date(post.publishedAt || post.updatedAt || 0);
      const year = String(date.getUTCFullYear()).padStart(4, "0");
      const month = String(date.getUTCMonth() + 1).padStart(2, "0");
      return "/cms/posts/" + year + "/" + month + "/" + slug + ".html";
    }
    return "/cms/posts/" + slug + ".html";
  };

  const mount = async (node) => {
    const limit = node.getAttribute("data-limit") || "5";
    const category = node.getAttribute("data-category");
    const params = new URLSearchParams({ limit });
    if (category) params.set("category", category);

    const response = await fetch("${config.cmsApiPrefix}/posts?" + params.toString());
    if (!response.ok) {
      const message = document.createElement("p");
      message.textContent = "Unable to load posts.";
      node.replaceChildren(message);
      return;
    }

    const data = await response.json();
    const fragment = document.createDocumentFragment();
    for (const post of data.items) {
      const article = document.createElement("article");
      article.className = "hybrid-static-cms-embed-card";
      const heading = document.createElement("h3");
      const link = document.createElement("a");
      link.href = postPath(post);
      link.textContent = String(post.title ?? "");
      heading.append(link);
      article.append(heading);
      if (post.excerpt) {
        const excerpt = document.createElement("p");
        excerpt.textContent = String(post.excerpt);
        article.append(excerpt);
      }
      fragment.append(article);
    }
    node.replaceChildren(fragment);
  };

  nodes.forEach((node) => {
    mount(node).catch(() => {
      const message = document.createElement("p");
      message.textContent = "Unable to load posts.";
      node.replaceChildren(message);
    });
  });
})();`;
}

async function listAllPublishedPosts() {
  const first = await listPosts({ page: 1, limit: 50, status: "published" });
  const items = [...first.items];
  for (let page = 2; items.length < first.total; page += 1) {
    const result = await listPosts({ page, limit: 50, status: "published" });
    if (result.items.length === 0) break;
    items.push(...result.items);
  }
  return { ...first, items };
}

async function listAllPublishedPages() {
  const first = await listPages({ page: 1, limit: 50, status: "published" });
  const items = [...first.items];
  for (let page = 2; items.length < first.total; page += 1) {
    const result = await listPages({ page, limit: 50, status: "published" });
    if (result.items.length === 0) break;
    items.push(...result.items);
  }
  return { ...first, items };
}

const postArtifactManifest = ".post-artifacts.json";

async function readPostArtifactManifest() {
  try {
    const parsed = JSON.parse(await readFile(path.join(config.cmsOutputDir, postArtifactManifest), "utf8"));
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function isManagedPostArtifact(relativePath: string) {
  const normalized = path.posix.normalize(relativePath);
  return normalized === relativePath && normalized.startsWith("posts/") && normalized.endsWith(".html") && !normalized.includes("../");
}

async function removeObsoletePostArtifacts(currentPaths: string[], legacyPaths: string[]) {
  const previousPaths = await readPostArtifactManifest();
  const current = new Set(currentPaths);
  const obsolete = new Set([...(previousPaths.length > 0 ? previousPaths : legacyPaths)].filter((item) => !current.has(item)));
  for (const relativePath of obsolete) {
    if (!isManagedPostArtifact(relativePath)) continue;
    await unlink(path.join(config.cmsOutputDir, ...relativePath.split("/"))).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  await writeArtifact(path.join(config.cmsOutputDir, postArtifactManifest), `${JSON.stringify(currentPaths.sort(), null, 2)}\n`);
}

export async function renderPublishedArtifacts() {
  await ensurePublicAssetDirectories();
  await emitHook("beforeRender", { outputDir: config.cmsOutputDir });
  const permalinkPattern = await getPostPermalinkPattern();
  const latest = await listPosts({ page: 1, limit: 5, status: "published" });
  const full = await listAllPublishedPosts();
  const pages = await listAllPublishedPages();
  const totalPages = Math.max(1, Math.ceil(full.total / config.defaultPageSize));
  const pageDir = path.join(config.cmsOutputDir, "posts", "page");
  const cmsPageDir = path.join(config.cmsOutputDir, "pages");

  await mkdir(path.join(config.cmsOutputDir, "posts"), { recursive: true });
  await mkdir(pageDir, { recursive: true });
  await mkdir(cmsPageDir, { recursive: true });

  await writeArtifact(path.join(config.cmsOutputDir, "posts", "latest.html"), renderFragment(latest.items, permalinkPattern));
  await writeArtifact(path.join(config.cmsOutputDir, "posts", "list.html"), renderList("All Posts", full.items, undefined, permalinkPattern));

  for (let page = 1; page <= totalPages; page += 1) {
    const paged = await listPosts({ page, limit: config.defaultPageSize, status: "published" });
    const html = renderList("Published Posts", paged.items, { page, totalPages }, permalinkPattern);
    await writeArtifact(path.join(pageDir, `${page}.html`), html);
  }

  await writeArtifact(path.join(config.cmsOutputDir, "posts", "rss.xml"), renderRss(full.items, permalinkPattern));
  const seriesNavigation = await listPostSeriesNavigation(full.items.map((post) => post.id));
  const commentsByPost = await listApprovedCommentsForPosts(full.items.map((post) => post.id));
  const currentPostArtifacts: string[] = [];
  for (const post of full.items) {
    const relativePath = postArtifactRelativePath(post, permalinkPattern);
    currentPostArtifacts.push(relativePath);
    await writeArtifact(path.join(config.cmsOutputDir, ...relativePath.split("/")), renderPost(post, seriesNavigation.get(post.id) ?? null, permalinkPattern, commentsByPost.get(post.id) ?? []));
  }
  await writeArtifact(path.join(cmsPageDir, "index.html"), renderPageIndex(pages.items));
  for (const page of pages.items) {
    await writeArtifact(path.join(cmsPageDir, `${page.slug}.html`), await renderPage(page));
  }
  await writeArtifact(path.join(config.publicHtmlDir, "sitemap.xml"), renderSitemap(full.items, pages.items, permalinkPattern));
  await writeArtifact(path.join(config.publicHtmlDir, "robots.txt"), renderRobotsTxt());
  await writeArtifact(path.join(config.publicHtmlDir, "llms.txt"), renderLlmsTxt(full.items, pages.items, permalinkPattern));
  await writeArtifact(path.join(config.cmsOutputDir, "embed.js"), renderEmbedScript(permalinkPattern));
  await renderFormArtifacts();
  await renderMenuArtifacts();
  const legacyPostArtifacts = permalinkPattern === "post_name"
    ? []
    : full.items.map((post) => postArtifactRelativePath(post, "post_name"));
  await removeObsoletePostArtifacts(currentPostArtifacts, legacyPostArtifacts);
  await emitHook("afterRender", { outputDir: config.cmsOutputDir });
}
