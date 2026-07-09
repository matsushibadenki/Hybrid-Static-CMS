import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { config } from "./config";
import { escapeHtml } from "./content";
import { renderFormArtifacts } from "./forms";
import { listPages } from "./pages";
import { listPosts } from "./posts";
import type { PageRecord, PostRecord } from "./types";

type SeoMeta = {
  title: string;
  description?: string;
  canonicalUrl?: string;
  jsonLd?: string;
  robots?: string;
};

function safeJsonLd(value: string) {
  return value.replaceAll("</script>", "<\\/script>");
}

function postPublicPath(slug: string) {
  return `/cms/posts/${slug}.html`;
}

function pagePublicPath(slug: string) {
  return `/cms/pages/${slug}.html`;
}

function card(post: PostRecord) {
  const href = postPublicPath(post.slug);
  return `
    <article class="hybrid-static-cms-card">
      <div class="hybrid-static-cms-card__meta">
        <span>${escapeHtml(post.publishedAt ? new Date(post.publishedAt).toLocaleDateString("en-US") : "Draft")}</span>
        ${post.categories[0] ? `<span>${escapeHtml(post.categories[0])}</span>` : ""}
      </div>
      <h3><a href="${href}">${escapeHtml(post.title)}</a></h3>
      ${post.excerpt ? `<p>${escapeHtml(post.excerpt)}</p>` : ""}
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
  const jsonLd = meta.jsonLd ? `<script type="application/ld+json">${safeJsonLd(meta.jsonLd)}</script>` : "";
  const robots = meta.robots ? `<meta name="robots" content="${escapeHtml(meta.robots)}" />` : "";
  return `<!doctype html>
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
    ${robots}
    ${jsonLd}
    <style>
      body { margin: 0; font-family: Georgia, serif; background: #f7f4ea; color: #1f2933; }
      main { max-width: 960px; margin: 0 auto; padding: 40px 16px 72px; }
      .hybrid-static-cms-list { display: grid; gap: 16px; }
      .hybrid-static-cms-card { background: rgba(255,255,255,0.88); border: 1px solid rgba(0,0,0,0.08); border-radius: 24px; padding: 20px; }
      .hybrid-static-cms-card__meta { display: flex; gap: 12px; color: #52606d; font-size: 0.85rem; margin-bottom: 10px; }
      h1, h2, h3 { margin-top: 0; }
      a { color: #b4492c; text-decoration: none; }
      .pagination { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 24px; }
      .hybrid-static-cms-prose { line-height: 1.75; }
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
    {
      title,
      description: `Published content list for ${config.appName}.`,
      canonicalUrl: `${config.appUrl}/cms/posts/list.html`,
    },
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
  const canonicalUrl = `${config.appUrl}${pagePublicPath(page.slug)}`;
  const robots = [page.seoNoindex ? "noindex" : "index", page.seoNofollow ? "nofollow" : "follow"].join(", ");
  return pageTemplate(
    {
      title: page.seoTitle || page.title,
      description: page.seoDescription || page.excerpt || undefined,
      canonicalUrl,
      robots,
      jsonLd: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: page.title,
        description: page.seoDescription || page.excerpt || undefined,
        url: canonicalUrl,
        dateModified: page.updatedAt,
      }),
    },
    `
      <article class="hybrid-static-cms-page hybrid-static-cms-prose">
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
          <h3><a href="${pagePublicPath(page.slug)}">${escapeHtml(page.title)}</a></h3>
          ${page.excerpt ? `<p>${escapeHtml(page.excerpt)}</p>` : ""}
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
    `<h1>CMS Managed Pages</h1><section class="hybrid-static-cms-list">${cards || "<p>No pages published yet.</p>"}</section>`,
  );
}

function renderPost(post: PostRecord) {
  const canonicalUrl = `${config.appUrl}${postPublicPath(post.slug)}`;
  const robots = [post.seoNoindex ? "noindex" : "index", post.seoNofollow ? "nofollow" : "follow"].join(", ");
  return pageTemplate(
    {
      title: post.seoTitle || post.title,
      description: post.seoDescription || post.excerpt || undefined,
      canonicalUrl,
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
      <article class="hybrid-static-cms-prose">
        <p style="color:#52606d;">
          ${escapeHtml(post.publishedAt ? new Date(post.publishedAt).toLocaleDateString("en-US") : "Draft")}
          ${post.authorName ? ` · ${escapeHtml(post.authorName)}` : ""}
        </p>
        <h1>${escapeHtml(post.title)}</h1>
        ${post.excerpt ? `<p>${escapeHtml(post.excerpt)}</p>` : ""}
        <div>${post.bodyHtml}</div>
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
    return `<url><loc>${escapeHtml(config.appUrl + postPublicPath(post.slug))}</loc><lastmod>${lastmod}</lastmod></url>`;
  });
  const pageItems = pages.filter((page) => !page.seoNoindex).map((page) => {
    const lastmod = page.updatedAt ? new Date(page.updatedAt).toISOString() : new Date().toISOString();
    return `<url><loc>${escapeHtml(config.appUrl + pagePublicPath(page.slug))}</loc><lastmod>${lastmod}</lastmod></url>`;
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
  for (const post of full.items) {
    await writeFile(path.join(config.cmsOutputDir, "posts", `${post.slug}.html`), renderPost(post), "utf8");
  }
  await writeFile(path.join(cmsPageDir, "index.html"), renderPageIndex(pages.items), "utf8");
  for (const page of pages.items) {
    await writeFile(path.join(cmsPageDir, `${page.slug}.html`), renderPage(page), "utf8");
  }
  await writeFile(path.join(config.publicHtmlDir, "sitemap.xml"), renderSitemap(full.items, pages.items), "utf8");
  await writeFile(path.join(config.publicHtmlDir, "robots.txt"), renderRobotsTxt(), "utf8");
  await writeFile(path.join(config.publicHtmlDir, "llms.txt"), renderLlmsTxt(full.items, pages.items), "utf8");
  await writeFile(path.join(config.cmsOutputDir, "embed.js"), renderEmbedScript(), "utf8");
  await renderFormArtifacts();
}
