import { describe, expect, test } from "bun:test";
import { sql } from "../src/core/db";
import { config } from "../src/core/config";
import { listPages } from "../src/core/pages";
import { listPosts } from "../src/core/posts";
import { getSearchDiagnostics, rebuildSearchIndexes, resolveSearchCandidates, searchContent } from "../src/core/search";
import { createApp } from "../src/server/app";

describe.skipIf(process.env.RUN_DB_INTEGRATION_TESTS !== "true")("multilingual search integration", () => {
  test("external candidates use current titles and exclude unpublished content", async () => {
    const slug = crypto.randomUUID();
    const rows = await sql`insert into posts (title, slug, body_md, body_html, status) values ('Current title', ${slug}, '', '', 'published') returning id`;
    const id = Number(rows[0].id);
    try {
      expect((await resolveSearchCandidates([{ type: "post", id }], 20))[0]?.title).toBe("Current title");
      const oldUrl = config.searchApiUrl;
      const oldToken = config.searchApiToken;
      try {
        config.searchApiUrl = "invalid-endpoint";
        config.searchApiToken = "test-token";
        expect((await searchContent("Current title")).items.some((item) => item.id === id)).toBe(true);
      } finally {
        config.searchApiUrl = oldUrl;
        config.searchApiToken = oldToken;
      }
      await sql`update posts set status = 'draft' where id = ${id}`;
      expect(await resolveSearchCandidates([{ type: "post", id }], 20)).toEqual([]);
      await sql`delete from posts where id = ${id}`;
      expect(await resolveSearchCandidates([{ type: "post", id }], 20)).toEqual([]);
    } finally { await sql`delete from posts where id = ${id}`; }
  });
  test("finds normalized Japanese and Simplified Chinese content across posts and pages", async () => {
    const suffix = crypto.randomUUID();
    const postSlug = `search-post-${suffix}`;
    const pageSlug = `search-page-${suffix}`;
    try {
      await sql`insert into posts (title, slug, excerpt, body_md, body_html, status, published_at) values (${"ＡＢＣ 東京文化案内"}, ${postSlug}, ${"街の読みもの"}, ${"東京都の美術館を紹介します。"}, ${"<p>東京都の美術館を紹介します。</p>"}, 'published', now())`;
      await sql`insert into pages (title, slug, excerpt, body_md, body_html, status, published_at) values (${"城市指南"}, ${pageSlug}, ${"简体中文页面"}, ${""}, ${"<p>介绍城市交通和文化。</p>"}, 'published', now())`;

      expect((await listPosts({ status: "published", search: "東京" })).items.some((item) => item.slug === postSlug)).toBe(true);
      expect((await listPosts({ status: "published", search: "都" })).items.some((item) => item.slug === postSlug)).toBe(true);
      expect((await listPosts({ status: "published", search: "abc" })).items.some((item) => item.slug === postSlug)).toBe(true);
      expect((await listPages({ status: "published", search: "城市" })).items.some((item) => item.slug === pageSlug)).toBe(true);

      const combined = await searchContent("文化", { status: "published" });
      expect(combined.items.some((item) => item.slug === postSlug && item.type === "post")).toBe(true);
      expect(combined.items.some((item) => item.slug === pageSlug && item.type === "page")).toBe(true);

      const response = await createApp().request("http://localhost/cms-api/search?type=all&q=%E6%96%87%E5%8C%96");
      expect(response.status).toBe(200);
      const payload = await response.json() as { items: Array<{ slug: string }> };
      expect(payload.items.some((item) => item.slug === postSlug)).toBe(true);
      expect(payload.items.some((item) => item.slug === pageSlug)).toBe(true);

      await rebuildSearchIndexes();
      const diagnostics = await getSearchDiagnostics();
      expect(diagnostics.healthy).toBe(true);
      expect(diagnostics.extensionVersion).not.toBeNull();
    } finally {
      await sql`delete from posts where slug = ${postSlug}`;
      await sql`delete from pages where slug = ${pageSlug}`;
    }
  });
});
