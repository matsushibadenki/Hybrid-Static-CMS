import { unlink } from "node:fs/promises";
import { describe, expect, test } from "bun:test";
import { createUser } from "../src/core/auth";
import { deletePost, createPost } from "../src/core/posts";
import { renderPublishedArtifacts } from "../src/core/renderer";
import { sql } from "../src/core/db";
import { config } from "../src/core/config";
import path from "node:path";

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
});
