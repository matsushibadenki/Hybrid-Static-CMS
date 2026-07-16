import { sql } from "../core/db";
import { createUser } from "../core/auth";
import { createForm } from "../core/forms";
import { createPage } from "../core/pages";
import { renderPublishedArtifacts } from "../core/renderer";
import { createPost } from "../core/posts";

const seedAdminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
const seedAdminPassword = process.env.SEED_ADMIN_PASSWORD;
if (!seedAdminEmail || !seedAdminPassword) {
  throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set before running the seed script.");
}

const existingOwners = await sql`
  select u.id
  from users u
  join user_roles ur on u.id = ur.user_id
  join roles r on r.id = ur.role_id
  where r.name = 'owner'
  limit 1
`;

let userId = existingOwners[0]?.id ? Number(existingOwners[0].id) : null;
if (!userId) {
  userId = await createUser({
    email: seedAdminEmail,
    password: seedAdminPassword,
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

const forms = await sql`select count(*)::int as total from forms`;
if (Number(forms[0]?.total ?? 0) === 0) {
  await createForm(
    {
      title: "Contact Form",
      slug: "contact-form",
      description: "A starter contact form for your existing public_html site.",
      status: "published",
      submitLabel: "Send message",
      successMessage: "Thank you. We received your message.",
      fields: [
        { name: "name", label: "Name", type: "text", required: true },
        { name: "email", label: "Email", type: "email", required: true },
        { name: "message", label: "Message", type: "textarea", required: true },
      ],
    },
    userId,
  );
}

await renderPublishedArtifacts();
console.log("Seed complete.");
