import { describe, expect, test } from "bun:test";
import { createUser } from "../src/core/auth";
import {
  contentArchiveFormat,
  contentArchiveVersion,
  createContentArchive,
  importContentArchive,
  type ContentArchive,
} from "../src/core/contentPortability";
import { sql } from "../src/core/db";
import { createPageGroup, deletePageGroup } from "../src/core/pageGroups";
import { getPageBySlug } from "../src/core/pages";
import { getPostBySlug } from "../src/core/posts";
import { createSeries, deleteSeries } from "../src/core/series";

describe.skipIf(process.env.RUN_DB_INTEGRATION_TESTS !== "true")("content portability integration", () => {
  test("imports sanitized drafts, maps existing parent slugs, and exports without account data", async () => {
    const suffix = crypto.randomUUID();
    const postSlug = `portable-post-${suffix}`;
    const pageSlug = `portable-page-${suffix}`;
    const seriesSlug = `portable-series-${suffix}`;
    const groupSlug = `portable-group-${suffix}`;
    let userId: number | null = null;
    let seriesId: number | null = null;
    let groupId: number | null = null;
    try {
      userId = await createUser({ email: `portable-${suffix}@example.test`, password: "integration-password-123", displayName: "Portability Editor", roles: ["editor"] });
      seriesId = (await createSeries({ title: "Portable series", slug: seriesSlug }))?.id ?? null;
      groupId = (await createPageGroup({ title: "Portable group", slug: groupSlug }))?.id ?? null;
      const archive: ContentArchive = {
        format: contentArchiveFormat, version: contentArchiveVersion, exportedAt: new Date().toISOString(),
        posts: [{
          locale: "en", translationGroup: "00000000-0000-4000-8000-000000000011",
          title: "Imported post", slug: postSlug, excerpt: null, bodyMd: null,
          bodyHtml: "<p>Safe</p><script>alert(1)</script>", sourceStatus: "published", publishedAt: new Date().toISOString(),
          seoTitle: null, seoDescription: null, seoCanonicalUrl: null, seoOgImage: null, seoKeywords: null,
          seoNoindex: false, seoNofollow: false, categories: ["portable"], tags: ["migration"],
          commentsPolicy: "disabled", seriesSlug,
        }],
        pages: [{
          locale: "ja", translationGroup: "00000000-0000-4000-8000-000000000012",
          title: "Imported page", slug: pageSlug, excerpt: null, bodyMd: "Page", bodyHtml: "<p>Page</p>",
          sourceStatus: "scheduled", publishedAt: new Date().toISOString(),
          seoTitle: null, seoDescription: null, seoCanonicalUrl: null, seoOgImage: null, seoKeywords: null,
          seoNoindex: true, seoNofollow: false, stylesheetPath: "pages/missing.css", pageGroupSlug: groupSlug,
        }],
      };
      const result = await importContentArchive(archive, userId);
      expect(result.importedPosts).toBe(1);
      expect(result.importedPages).toBe(1);
      expect(result.warnings).toHaveLength(1);

      const post = await getPostBySlug(postSlug, "any");
      const page = await getPageBySlug(pageSlug, "any", "ja");
      expect(post?.status).toBe("draft");
      expect(post?.bodyHtml).not.toContain("<script");
      expect(post?.commentsPolicy).toBe("disabled");
      expect(page?.status).toBe("draft");
      expect(page?.stylesheetPath).toBeNull();

      const exported = await createContentArchive();
      const exportedJson = JSON.stringify(exported);
      expect(exported.posts.some((item) => item.slug === postSlug && item.seriesSlug === seriesSlug)).toBe(true);
      expect(exported.pages.some((item) => item.slug === pageSlug && item.pageGroupSlug === groupSlug)).toBe(true);
      expect(exportedJson).not.toContain("Portability Editor");
      expect(exportedJson).not.toContain(`portable-${suffix}@example.test`);
    } finally {
      await sql`delete from posts where slug = ${postSlug}`;
      await sql`delete from pages where slug = ${pageSlug}`;
      if (seriesId) await deleteSeries(seriesId);
      if (groupId) await deletePageGroup(groupId);
      if (userId) await sql`delete from users where id = ${userId}`;
    }
  });
});
