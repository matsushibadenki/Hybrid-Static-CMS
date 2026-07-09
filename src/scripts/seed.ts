import { sql } from "../core/db";
import { createUser } from "../core/auth";
import { createPage } from "../core/pages";
import { renderPublishedArtifacts } from "../core/renderer";
import { createPost } from "../core/posts";

const existing = await sql`select id from users where email = 'owner@example.com' limit 1`;

let userId = existing[0]?.id ? Number(existing[0].id) : null;
if (!userId) {
  userId = await createUser({
    email: "owner@example.com",
    password: "change-me-now",
    displayName: "Site Owner",
    roles: ["owner", "admin"],
  });
}

const posts = await sql`select count(*)::int as total from posts`;
if (Number(posts[0]?.total ?? 0) === 0) {
  await createPost(
    {
      title: "Welcome to Hybrid-Static-CMS",
      slug: "welcome-to-hybrid-static-cms",
      excerpt: "A starter post proving static fragments, API output, and admin publishing all work together.",
      bodyMd: `# Welcome

Hybrid-Static-CMS is built for existing public_html sites.

## Publishing flow

Write in the control panel, publish to PostgreSQL, then regenerate HTML fragments, RSS, and sitemap output.`,
      status: "published",
      categorySlugs: ["news"],
      tagSlugs: ["welcome", "cms"],
      seoTitle: "Welcome to Hybrid-Static-CMS",
      seoDescription: "Starter article for the Hybrid-Static-CMS coexistence CMS.",
    },
    userId,
  );
}

const pages = await sql`select count(*)::int as total from pages`;
if (Number(pages[0]?.total ?? 0) === 0) {
  await createPage(
    {
      title: "About This Site",
      slug: "about-this-site",
      excerpt: "A CMS-managed page that can coexist with the rest of the public site.",
      bodyMd: `# About This Site

This page is managed inside Hybrid-Static-CMS.

You can link to it from existing HTML or PHP pages without handing the whole site to the CMS.`,
      status: "published",
      seoTitle: "About This Site",
      seoDescription: "Starter page for Hybrid-Static-CMS.",
    },
    userId,
  );
}

await renderPublishedArtifacts();
console.log("Seed complete.");
