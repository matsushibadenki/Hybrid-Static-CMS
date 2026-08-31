import { unlink } from "node:fs/promises";
import { describe, expect, test } from "bun:test";
import { createUser } from "../src/core/auth";
import { deletePost, createPost } from "../src/core/posts";
import { renderPublishedArtifacts } from "../src/core/renderer";
import { sql } from "../src/core/db";
import { config } from "../src/core/config";
import path from "node:path";
import { assignPostToSeries, createSeries, deleteSeries } from "../src/core/series";
import { getPostPermalinkPattern, setPostPermalinkPattern } from "../src/core/settings";

const slug = `integration-post-${crypto.randomUUID()}`;
let userId: number | null = null;
let postId: number | null = null;

describe.skipIf(process.env.RUN_DB_INTEGRATION_TESTS !== "true")("publishing integration", () => {
  test("renders a published post to a static HTML artifact", async () => {
    const artifact = path.join(config.cmsOutputDir, "posts", `${slug}.html`);
    try {
      userId = await createUser({
        email: `publisher-${crypto.randomUUID()}@example.test`,
        password: "integration-password-123",
        displayName: "Publisher",
        roles: ["owner"],
      });
      const post = await createPost({
        title: "Integration Published Post",
        slug,
        excerpt: "Published excerpt",
        bodyMd: "",
        bodyHtml: "<p>Published body</p>",
        status: "published",
        publishedAt: new Date().toISOString(),
        categorySlugs: [],
        tagSlugs: [],
      }, userId);
      postId = post?.id ?? null;
      await renderPublishedArtifacts();

      expect(await Bun.file(artifact).exists()).toBe(true);
      expect(await Bun.file(artifact).text()).toContain("Integration Published Post");
      expect(await Bun.file(artifact).text()).toContain("Published body");
    } finally {
      if (postId) await deletePost(postId);
      if (userId) await sql`delete from users where id = ${userId}`;
      await unlink(artifact).catch(() => undefined);
    }
  });

  test("renders ordered navigation between published posts in the same series", async () => {
    const testId = crypto.randomUUID();
    const firstSlug = `series-first-${testId}`;
    const secondSlug = `series-second-${testId}`;
    const firstArtifact = path.join(config.cmsOutputDir, "posts", `${firstSlug}.html`);
    const secondArtifact = path.join(config.cmsOutputDir, "posts", `${secondSlug}.html`);
    let localUserId: number | null = null;
    let localSeriesId: number | null = null;
    let firstPostId: number | null = null;
    let secondPostId: number | null = null;
    try {
      localUserId = await createUser({
        email: `series-publisher-${testId}@example.test`,
        password: "integration-password-123",
        displayName: "Series Publisher",
        roles: ["owner"],
      });
      const series = await createSeries({ title: "Integration Series", slug: `integration-series-${testId}` });
      localSeriesId = series?.id ?? null;
      const first = await createPost({ title: "Series First", slug: firstSlug, bodyHtml: "<p>First</p>", status: "published" }, localUserId);
      const second = await createPost({ title: "Series Second", slug: secondSlug, bodyHtml: "<p>Second</p>", status: "published" }, localUserId);
      firstPostId = first?.id ?? null;
      secondPostId = second?.id ?? null;
      if (!localSeriesId || !firstPostId || !secondPostId) throw new Error("Series fixture creation failed.");
      await assignPostToSeries(localSeriesId, firstPostId, 0);
      await assignPostToSeries(localSeriesId, secondPostId, 1);

      await renderPublishedArtifacts();
      const html = await Bun.file(secondArtifact).text();
      expect(html).toContain("Integration Series");
      expect(html).toContain(`/cms/posts/${firstSlug}.html`);
      expect(html).toContain("2 / 2");
    } finally {
      if (firstPostId) await deletePost(firstPostId);
      if (secondPostId) await deletePost(secondPostId);
      if (localSeriesId) await deleteSeries(localSeriesId);
      if (localUserId) await sql`delete from users where id = ${localUserId}`;
      await unlink(firstArtifact).catch(() => undefined);
      await unlink(secondArtifact).catch(() => undefined);
    }
  });

  test("renders locale-specific artifacts and alternate language links for a translation group", async () => {
    const testId = crypto.randomUUID();
    const localizedSlug = `localized-${testId}`;
    const translationGroup = crypto.randomUUID();
    const englishArtifact = path.join(config.cmsOutputDir, "posts", `${localizedSlug}.html`);
    const japaneseArtifact = path.join(config.cmsOutputDir, "ja", "posts", `${localizedSlug}.html`);
    let localUserId: number | null = null;
    let englishPostId: number | null = null;
    let japanesePostId: number | null = null;
    try {
      localUserId = await createUser({
        email: `localized-publisher-${testId}@example.test`,
        password: "integration-password-123",
        displayName: "Localized Publisher",
        roles: ["owner"],
      });
      const english = await createPost({
        title: "Localized article",
        slug: localizedSlug,
        bodyHtml: "<p>English body</p>",
        status: "published",
        locale: "en",
        translationGroup,
      }, localUserId);
      const japanese = await createPost({
        title: "多言語の記事",
        slug: localizedSlug,
        bodyHtml: "<p>日本語本文</p>",
        status: "published",
        locale: "ja",
        translationGroup,
      }, localUserId);
      englishPostId = english?.id ?? null;
      japanesePostId = japanese?.id ?? null;

      await renderPublishedArtifacts();

      expect(await Bun.file(englishArtifact).exists()).toBe(true);
      expect(await Bun.file(japaneseArtifact).exists()).toBe(true);
      const japaneseHtml = await Bun.file(japaneseArtifact).text();
      expect(japaneseHtml).toContain('<html lang="ja">');
      expect(japaneseHtml).toContain(`/cms/posts/${localizedSlug}.html`);
      expect(japaneseHtml).toContain(`/cms/ja/posts/${localizedSlug}.html`);
    } finally {
      if (englishPostId) await deletePost(englishPostId);
      if (japanesePostId) await deletePost(japanesePostId);
      if (localUserId) await sql`delete from users where id = ${localUserId}`;
      await unlink(englishArtifact).catch(() => undefined);
      await unlink(japaneseArtifact).catch(() => undefined);
      await renderPublishedArtifacts().catch(() => undefined);
    }
  });

  test("regenerates article paths and removes the previous permalink artifact", async () => {
    const testId = crypto.randomUUID();
    const permalinkSlug = `permalink-${testId}`;
    const publishedAt = "2026-07-22T10:00:00.000Z";
    const flatArtifact = path.join(config.cmsOutputDir, "posts", `${permalinkSlug}.html`);
    const datedArtifact = path.join(config.cmsOutputDir, "posts", "2026", "07", `${permalinkSlug}.html`);
    const previousPattern = await getPostPermalinkPattern();
    let localUserId: number | null = null;
    let localPostId: number | null = null;
    try {
      localUserId = await createUser({
        email: `permalink-publisher-${testId}@example.test`,
        password: "integration-password-123",
        displayName: "Permalink Publisher",
        roles: ["owner"],
      });
      await setPostPermalinkPattern("post_name");
      const post = await createPost({ title: "Permalink Test", slug: permalinkSlug, bodyHtml: "<p>Permalink</p>", status: "published", publishedAt }, localUserId);
      localPostId = post?.id ?? null;
      await renderPublishedArtifacts();
      expect(await Bun.file(flatArtifact).exists()).toBe(true);

      await setPostPermalinkPattern("year_month");
      await renderPublishedArtifacts();
      expect(await Bun.file(datedArtifact).exists()).toBe(true);
      expect(await Bun.file(datedArtifact).text()).toContain(`/cms/posts/2026/07/${permalinkSlug}.html`);
      expect(await Bun.file(flatArtifact).exists()).toBe(false);
    } finally {
      if (localPostId) await deletePost(localPostId);
      if (localUserId) await sql`delete from users where id = ${localUserId}`;
      await setPostPermalinkPattern(previousPattern);
      await renderPublishedArtifacts().catch(() => undefined);
      await unlink(flatArtifact).catch(() => undefined);
      await unlink(datedArtifact).catch(() => undefined);
    }
  });
});
