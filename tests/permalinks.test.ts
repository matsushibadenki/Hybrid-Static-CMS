import { describe, expect, test } from "bun:test";
import { postArtifactRelativePath, postPermalinkPath } from "../src/core/permalinks";

const post = {
  id: 42,
  slug: "release-notes",
  publishedAt: "2026-07-22T23:30:00.000Z",
  updatedAt: "2026-07-23T00:00:00.000Z",
  categories: ["news"],
};

describe("post permalinks", () => {
  test("builds every supported public structure", () => {
    expect(postPermalinkPath(post, "post_name")).toBe("/cms/posts/release-notes.html");
    expect(postPermalinkPath(post, "year_month")).toBe("/cms/posts/2026/07/release-notes.html");
    expect(postPermalinkPath(post, "category")).toBe("/cms/posts/category/news/release-notes.html");
    expect(postPermalinkPath(post, "numeric")).toBe("/cms/posts/42.html");
  });

  test("uses a deterministic category fallback and artifact path", () => {
    expect(postPermalinkPath({ ...post, categories: [] }, "category")).toBe("/cms/posts/category/uncategorized/release-notes.html");
    expect(postArtifactRelativePath(post, "year_month")).toBe("posts/2026/07/release-notes.html");
  });

  test("keeps English paths stable and scopes translated paths by locale", () => {
    const english = { id: 12, slug: "same-slug", publishedAt: null, updatedAt: "2026-01-01T00:00:00.000Z", categories: [], locale: "en" as const };
    const japanese = { ...english, locale: "ja" as const };
    const chinese = { ...english, locale: "zh" as const };
    expect(postPermalinkPath(english, "post_name")).toBe("/cms/posts/same-slug.html");
    expect(postPermalinkPath(japanese, "post_name")).toBe("/cms/ja/posts/same-slug.html");
    expect(postPermalinkPath(chinese, "category")).toBe("/cms/zh/posts/category/uncategorized/same-slug.html");
  });
});
