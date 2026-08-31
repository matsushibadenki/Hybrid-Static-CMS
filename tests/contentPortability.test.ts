import { describe, expect, test } from "bun:test";
import {
  contentArchiveFormat,
  contentArchiveVersion,
  parseContentArchive,
  type ContentArchive,
} from "../src/core/contentPortability";

function archiveFixture(): ContentArchive {
  return {
    format: contentArchiveFormat,
    version: contentArchiveVersion,
    exportedAt: "2026-08-05T00:00:00.000Z",
    posts: [{
      locale: "en", translationGroup: "00000000-0000-4000-8000-000000000001",
      title: "Portable post", slug: "portable-post", excerpt: null, bodyMd: "Body", bodyHtml: "<p>Body</p>",
      sourceStatus: "published", publishedAt: "2026-08-05T00:00:00.000Z",
      seoTitle: null, seoDescription: null, seoCanonicalUrl: null, seoOgImage: null, seoKeywords: null,
      seoNoindex: false, seoNofollow: false, categories: ["news"], tags: ["portable"],
      commentsPolicy: "inherit", seriesSlug: "release-notes",
    }],
    pages: [{
      locale: "ja", translationGroup: "00000000-0000-4000-8000-000000000002",
      title: "Portable page", slug: "portable-page", excerpt: null, bodyMd: null, bodyHtml: "",
      sourceStatus: "draft", publishedAt: null,
      seoTitle: null, seoDescription: null, seoCanonicalUrl: null, seoOgImage: null, seoKeywords: null,
      seoNoindex: true, seoNofollow: false, stylesheetPath: "pages/custom.css", pageGroupSlug: null,
    }],
  };
}

describe("content portability archive", () => {
  test("accepts the versioned format and empty HTML when Markdown is used", () => {
    const parsed = parseContentArchive(JSON.stringify(archiveFixture()));
    expect(parsed.posts[0].seriesSlug).toBe("release-notes");
    expect(parsed.pages[0].bodyHtml).toBe("");
  });

  test("rejects unsupported versions, unsafe slugs, and duplicates", () => {
    expect(() => parseContentArchive(JSON.stringify({ ...archiveFixture(), version: 2 }))).toThrow("not supported");
    const unsafe = archiveFixture();
    unsafe.posts[0].slug = "../private";
    expect(() => parseContentArchive(JSON.stringify(unsafe))).toThrow("single hyphens");
    const duplicate = archiveFixture();
    duplicate.posts.push({ ...duplicate.posts[0] });
    expect(() => parseContentArchive(JSON.stringify(duplicate))).toThrow("duplicate post locale and slug pairs");
  });

  test("rejects non-JSON input and excessive item counts", () => {
    expect(() => parseContentArchive("not-json")).toThrow("not valid JSON");
    const excessive = archiveFixture();
    excessive.posts = Array.from({ length: 1_001 }, (_, index) => ({ ...excessive.posts[0], slug: `post-${index}` }));
    expect(() => parseContentArchive(JSON.stringify(excessive))).toThrow("more than 1000");
  });
});
