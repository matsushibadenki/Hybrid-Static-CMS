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
});
