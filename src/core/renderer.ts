import path from "node:path";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
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

function postPublicPath(slug: string) {
  return `/cms/posts/${slug}.html`;
}

function pagePublicPath(slug: string) {
  return `/cms/pages/${slug}.html`;
}

async function writeArtifact(filePath: string, content: string) {
  const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryPath, content, "utf8");
    await rename(temporaryPath, filePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

function card(post: PostRecord, variant: "lead" | "compact" = "compact") {
  const href = postPublicPath(post.slug);
  return `
    <article class="hybrid-static-cms-card magazine-card magazine-card--${variant}">
      <div class="hybrid-static-cms-card__meta">
        <span>${escapeHtml(post.publishedAt ? new Date(post.publishedAt).toLocaleDateString("en-US", { dateStyle: "medium" }) : "Draft")}</span>
        ${post.categories[0] ? `<span>${escapeHtml(post.categories[0])}</span>` : ""}
      </div>
      <h3 class="magazine-card__title"><a href="${href}">${escapeHtml(post.title)}</a></h3>
      ${post.excerpt ? `<p>${escapeHtml(post.excerpt)}</p>` : ""}
      <a class="magazine-card__read" href="${href}">Read story <span aria-hidden="true">↗</span></a>
    </article>
  `;
}

function pageTemplate(meta: SeoMeta, body: string) {
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
  const fallback = `<!doctype html>
<html lang="en">
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

      .magazine-prose__body > p:first-child::first-letter {
        color: var(--accent);
        float: left;
        font-size: 3.4rem;
        line-height: 0.82;
        margin: 6px 6px 0 0;
        font-weight: 700;
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
  </head>
  <body>
    <main class="magazine-shell">
      <header class="magazine-masthead">
        <a class="magazine-masthead__name" href="${escapeHtml(config.appUrl)}/">${escapeHtml(config.appName)}</a>
        <span class="magazine-masthead__issue">${new Date().getFullYear()}</span>
      </header>
      <div class="magazine-rule"></div>
      ${body}
      <footer class="magazine-footer">${escapeHtml(config.appName)} · Built with Hybrid-Static-CMS</footer>
    </main>
  </body>
</html>`;
  try {
    const template = readFileSync(path.join(config.templateDir, "page.html"), "utf8");
    return template
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
      .replaceAll("{{body}}", body);
  } catch {
    return fallback;
  }
}

function renderList(title: string, posts: PostRecord[], pagination?: { page: number; totalPages: number }) {
  const cards = posts.map((post, index) => card(post, index === 0 ? "lead" : "compact")).join("");
  const pager =
    pagination && pagination.totalPages > 1
      ? `<nav class="magazine-pagination" aria-label="Post pages">${Array.from({ length: pagination.totalPages }, (_, index) => {
          const page = index + 1;
          return `<a href="/cms/posts/page/${page}.html">Page ${page}</a>`;
        }).join("")}</nav>`
      : "";

  return pageTemplate(
    {
      title,
      description: `Published content list for ${config.appName}.`,
      canonicalUrl: `${config.appUrl}/cms/posts/list.html`,
    },
    `<header class="magazine-page-header">
      <div><p class="magazine-page-header__eyebrow">The editorial index</p></div>
      <div><h1 class="magazine-page-header__title">${escapeHtml(title)}</h1><p class="magazine-page-header__deck">Stories, notes, and considered things from ${escapeHtml(config.appName)}.</p></div>
    </header>
    <section class="hybrid-static-cms-list magazine-index">${cards || '<p class="magazine-empty">No posts published yet.</p>'}</section>${pager}`,
  );
}

function renderFragment(posts: PostRecord[]) {
  if (posts.length === 0) {
    return `<div class="hybrid-static-cms-fragment"><p>No posts published yet.</p></div>`;
  }

  return `<div class="hybrid-static-cms-fragment magazine-index">${posts.map((post) => card(post)).join("")}</div>`;
}

export async function renderPage(page: PageRecord) {
  const expandedBody = await expandPublishedBlocks(page.bodyHtml);
  const canonicalUrl = page.seoCanonicalUrl || `${config.appUrl}${pagePublicPath(page.slug)}`;
  const robots = [page.seoNoindex ? "noindex" : "index", page.seoNofollow ? "nofollow" : "follow"].join(", ");
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
          <p class="magazine-kicker">CMS managed page</p>
          <h1 class="magazine-prose__title">${escapeHtml(page.title)}</h1>
          ${page.excerpt ? `<p class="magazine-prose__deck">${escapeHtml(page.excerpt)}</p>` : ""}
        </header>
        <div class="magazine-prose__body">${expandedBody}</div>
      </article>
    `,
  );
}

function renderPageIndex(pages: PageRecord[]) {
  const cards = pages
    .map(
      (page) => `
        <article class="hybrid-static-cms-card magazine-card magazine-card--compact">
          <div class="hybrid-static-cms-card__meta">
            <span>${escapeHtml(page.publishedAt ? new Date(page.publishedAt).toLocaleDateString("en-US") : "Draft")}</span>
          </div>
          <h3 class="magazine-card__title"><a href="${pagePublicPath(page.slug)}">${escapeHtml(page.title)}</a></h3>
          ${page.excerpt ? `<p>${escapeHtml(page.excerpt)}</p>` : ""}
          <a class="magazine-card__read" href="${pagePublicPath(page.slug)}">Open page <span aria-hidden="true">↗</span></a>
        </article>
      `,
    )
    .join("");

  return pageTemplate(
    {
      title: "CMS Managed Pages",
      description: `CMS-managed pages published by ${config.appName}.`,
      canonicalUrl: `${config.appUrl}/cms/pages/index.html`,
    },
    `<header class="magazine-page-header">
      <div><p class="magazine-page-header__eyebrow">The static desk</p></div>
      <div><h1 class="magazine-page-header__title">Pages</h1><p class="magazine-page-header__deck">Long-form pages published with ${escapeHtml(config.appName)}.</p></div>
    </header>
    <section class="hybrid-static-cms-list magazine-index">${cards || '<p class="magazine-empty">No pages published yet.</p>'}</section>`,
  );
}

export function renderPost(post: PostRecord) {
  const canonicalUrl = post.seoCanonicalUrl || `${config.appUrl}${postPublicPath(post.slug)}`;
  const robots = [post.seoNoindex ? "noindex" : "index", post.seoNofollow ? "nofollow" : "follow"].join(", ");
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
          ${escapeHtml(post.publishedAt ? new Date(post.publishedAt).toLocaleDateString("en-US") : "Draft")}
          ${post.authorName ? ` · By ${escapeHtml(post.authorName)}` : ""}
        </p>
        <h1 class="magazine-prose__title">${escapeHtml(post.title)}</h1>
        ${post.excerpt ? `<p class="magazine-prose__deck">${escapeHtml(post.excerpt)}</p>` : ""}
        </header>
        <div class="magazine-prose__body">${post.bodyHtml}</div>
      </article>
    `,
  );
}

function renderRss(posts: PostRecord[]) {
  const items = posts
    .map(
      (post) => `
      <item>
        <title>${escapeHtml(post.title)}</title>
        <link>${config.appUrl}/cms-api/posts/${escapeHtml(post.slug)}</link>
        <guid>${config.appUrl}/cms-api/posts/${escapeHtml(post.slug)}</guid>
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

function renderSitemap(posts: PostRecord[], pages: PageRecord[]) {
  const postItems = posts.filter((post) => !post.seoNoindex).map((post) => {
    const lastmod = post.updatedAt ? new Date(post.updatedAt).toISOString() : new Date().toISOString();
    return `<url><loc>${escapeHtml(post.seoCanonicalUrl || config.appUrl + postPublicPath(post.slug))}</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq></url>`;
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

function renderLlmsTxt(posts: PostRecord[], pages: PageRecord[]) {
  const visiblePosts = posts.filter((post) => !post.seoNoindex).slice(0, 20);
  const visiblePages = pages.filter((page) => !page.seoNoindex).slice(0, 20);

  const postLinks = visiblePosts.map((post) => `- ${post.title}: ${config.appUrl}${postPublicPath(post.slug)}`).join("\n");
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

function renderEmbedScript() {
  return `(() => {
  const nodes = document.querySelectorAll("[data-hybrid-static-cms-posts]");
  if (!nodes.length) return;

  const mount = async (node) => {
    const limit = node.getAttribute("data-limit") || "5";
    const category = node.getAttribute("data-category");
    const params = new URLSearchParams({ limit });
    if (category) params.set("category", category);

    const response = await fetch("${config.cmsApiPrefix}/posts?" + params.toString());
    if (!response.ok) {
      node.innerHTML = "<p>Unable to load posts.</p>";
      return;
    }

    const data = await response.json();
    node.innerHTML = data.items.map((post) => {
      const excerpt = post.excerpt ? "<p>" + post.excerpt + "</p>" : "";
      return '<article class="hybrid-static-cms-embed-card">' +
        '<h3><a href="/cms/posts/' + post.slug + '.html">' + post.title + '</a></h3>' +
        excerpt +
      '</article>';
    }).join("");
  };

  nodes.forEach((node) => {
    mount(node).catch(() => {
      node.innerHTML = "<p>Unable to load posts.</p>";
    });
  });
})();`;
}

export async function renderPublishedArtifacts() {
  await emitHook("beforeRender", { outputDir: config.cmsOutputDir });
  const latest = await listPosts({ page: 1, limit: 5, status: "published" });
  const full = await listPosts({ page: 1, limit: 100, status: "published" });
  const pages = await listPages({ page: 1, limit: 100, status: "published" });
  const totalPages = Math.max(1, Math.ceil(full.total / config.defaultPageSize));
  const pageDir = path.join(config.cmsOutputDir, "posts", "page");
  const cmsPageDir = path.join(config.cmsOutputDir, "pages");

  await mkdir(path.join(config.cmsOutputDir, "posts"), { recursive: true });
  await mkdir(pageDir, { recursive: true });
  await mkdir(cmsPageDir, { recursive: true });

  await writeArtifact(path.join(config.cmsOutputDir, "posts", "latest.html"), renderFragment(latest.items));
  await writeArtifact(path.join(config.cmsOutputDir, "posts", "list.html"), renderList("All Posts", full.items));

  for (let page = 1; page <= totalPages; page += 1) {
    const paged = await listPosts({ page, limit: config.defaultPageSize, status: "published" });
    const html = renderList("Published Posts", paged.items, { page, totalPages });
    await writeArtifact(path.join(pageDir, `${page}.html`), html);
  }

  await writeArtifact(path.join(config.cmsOutputDir, "posts", "rss.xml"), renderRss(full.items));
  for (const post of full.items) {
    await writeArtifact(path.join(config.cmsOutputDir, "posts", `${post.slug}.html`), renderPost(post));
  }
  await writeArtifact(path.join(cmsPageDir, "index.html"), renderPageIndex(pages.items));
  for (const page of pages.items) {
    await writeArtifact(path.join(cmsPageDir, `${page.slug}.html`), await renderPage(page));
  }
  await writeArtifact(path.join(config.publicHtmlDir, "sitemap.xml"), renderSitemap(full.items, pages.items));
  await writeArtifact(path.join(config.publicHtmlDir, "robots.txt"), renderRobotsTxt());
  await writeArtifact(path.join(config.publicHtmlDir, "llms.txt"), renderLlmsTxt(full.items, pages.items));
  await writeArtifact(path.join(config.cmsOutputDir, "embed.js"), renderEmbedScript());
  await renderFormArtifacts();
  await renderMenuArtifacts();
  await emitHook("afterRender", { outputDir: config.cmsOutputDir });
}
