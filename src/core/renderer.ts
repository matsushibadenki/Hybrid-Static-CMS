import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { config } from "./config";
import { escapeHtml } from "./content";
import { listPages } from "./pages";
import { listPosts } from "./posts";
import type { PageRecord, PostRecord } from "./types";

function card(post: PostRecord) {
  return `
    <article class="hybrid-static-cms-card">
      <div class="hybrid-static-cms-card__meta">
        <span>${escapeHtml(post.publishedAt ? new Date(post.publishedAt).toLocaleDateString("en-US") : "Draft")}</span>
        ${post.categories[0] ? `<span>${escapeHtml(post.categories[0])}</span>` : ""}
      </div>
      <h3><a href="/${escapeHtml(post.slug)}">${escapeHtml(post.title)}</a></h3>
      ${post.excerpt ? `<p>${escapeHtml(post.excerpt)}</p>` : ""}
    </article>
  `;
}

function pageTemplate(title: string, body: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { margin: 0; font-family: Georgia, serif; background: #f7f4ea; color: #1f2933; }
      main { max-width: 960px; margin: 0 auto; padding: 40px 16px 72px; }
      .hybrid-static-cms-list { display: grid; gap: 16px; }
      .hybrid-static-cms-card { background: rgba(255,255,255,0.88); border: 1px solid rgba(0,0,0,0.08); border-radius: 24px; padding: 20px; }
      .hybrid-static-cms-card__meta { display: flex; gap: 12px; color: #52606d; font-size: 0.85rem; margin-bottom: 10px; }
      h1, h2, h3 { margin-top: 0; }
      a { color: #b4492c; text-decoration: none; }
      .pagination { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 24px; }
    </style>
  </head>
  <body>
    <main>${body}</main>
  </body>
</html>`;
}

function renderList(title: string, posts: PostRecord[], pagination?: { page: number; totalPages: number }) {
  const cards = posts.map(card).join("");
  const pager =
    pagination && pagination.totalPages > 1
      ? `<nav class="pagination">${Array.from({ length: pagination.totalPages }, (_, index) => {
          const page = index + 1;
          return `<a href="/cms/posts/page/${page}.html">Page ${page}</a>`;
        }).join("")}</nav>`
      : "";

  return pageTemplate(
    title,
    `<h1>${escapeHtml(title)}</h1><section class="hybrid-static-cms-list">${cards || "<p>No posts published yet.</p>"}</section>${pager}`,
  );
}

function renderFragment(posts: PostRecord[]) {
  if (posts.length === 0) {
    return `<div class="hybrid-static-cms-fragment"><p>No posts published yet.</p></div>`;
  }

  return `<div class="hybrid-static-cms-fragment">${posts.map(card).join("")}</div>`;
}

function renderPage(page: PageRecord) {
  return pageTemplate(
    page.seoTitle || page.title,
    `
      <article class="hybrid-static-cms-page">
        <p style="color:#52606d;">CMS managed page</p>
        <h1>${escapeHtml(page.title)}</h1>
        ${page.excerpt ? `<p>${escapeHtml(page.excerpt)}</p>` : ""}
        <div>${page.bodyHtml}</div>
      </article>
    `,
  );
}

function renderPageIndex(pages: PageRecord[]) {
  const cards = pages
    .map(
      (page) => `
        <article class="hybrid-static-cms-card">
          <div class="hybrid-static-cms-card__meta">
            <span>${escapeHtml(page.publishedAt ? new Date(page.publishedAt).toLocaleDateString("en-US") : "Draft")}</span>
          </div>
          <h3><a href="/cms/pages/${escapeHtml(page.slug)}.html">${escapeHtml(page.title)}</a></h3>
          ${page.excerpt ? `<p>${escapeHtml(page.excerpt)}</p>` : ""}
        </article>
      `,
    )
    .join("");

  return pageTemplate(
    "CMS Managed Pages",
    `<h1>CMS Managed Pages</h1><section class="hybrid-static-cms-list">${cards || "<p>No pages published yet.</p>"}</section>`,
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
  const postItems = posts.map((post) => {
    const lastmod = post.updatedAt ? new Date(post.updatedAt).toISOString() : new Date().toISOString();
    return `<url><loc>${config.appUrl}/${escapeHtml(post.slug)}</loc><lastmod>${lastmod}</lastmod></url>`;
  });
  const pageItems = pages.map((page) => {
    const lastmod = page.updatedAt ? new Date(page.updatedAt).toISOString() : new Date().toISOString();
    return `<url><loc>${config.appUrl}/cms/pages/${escapeHtml(page.slug)}.html</loc><lastmod>${lastmod}</lastmod></url>`;
  });
  const items = [...postItems, ...pageItems]
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${config.appUrl}</loc></url>
  ${items}
</urlset>`;
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
        '<h3><a href="/' + post.slug + '">' + post.title + '</a></h3>' +
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
  const latest = await listPosts({ page: 1, limit: 5, status: "published" });
  const full = await listPosts({ page: 1, limit: 100, status: "published" });
  const pages = await listPages({ page: 1, limit: 100, status: "published" });
  const totalPages = Math.max(1, Math.ceil(full.total / config.defaultPageSize));
  const pageDir = path.join(config.cmsOutputDir, "posts", "page");
  const cmsPageDir = path.join(config.cmsOutputDir, "pages");

  await mkdir(path.join(config.cmsOutputDir, "posts"), { recursive: true });
  await mkdir(pageDir, { recursive: true });
  await mkdir(cmsPageDir, { recursive: true });

  await writeFile(path.join(config.cmsOutputDir, "posts", "latest.html"), renderFragment(latest.items), "utf8");
  await writeFile(path.join(config.cmsOutputDir, "posts", "list.html"), renderList("All Posts", full.items), "utf8");

  for (let page = 1; page <= totalPages; page += 1) {
    const paged = await listPosts({ page, limit: config.defaultPageSize, status: "published" });
    const html = renderList("Published Posts", paged.items, { page, totalPages });
    await writeFile(path.join(pageDir, `${page}.html`), html, "utf8");
  }

  await writeFile(path.join(config.cmsOutputDir, "posts", "rss.xml"), renderRss(full.items), "utf8");
  await writeFile(path.join(cmsPageDir, "index.html"), renderPageIndex(pages.items), "utf8");
  for (const page of pages.items) {
    await writeFile(path.join(cmsPageDir, `${page.slug}.html`), renderPage(page), "utf8");
  }
  await writeFile(path.join(config.publicHtmlDir, "sitemap.xml"), renderSitemap(full.items, pages.items), "utf8");
  await writeFile(path.join(config.cmsOutputDir, "embed.js"), renderEmbedScript(), "utf8");
}
