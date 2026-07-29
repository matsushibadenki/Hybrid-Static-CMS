import { describe, expect, test } from "bun:test";
import { createUser } from "../src/core/auth";
import { approveComment, createPendingComment, listApprovedCommentsForPosts, listComments } from "../src/core/comments";
import { sql } from "../src/core/db";
import { createPost, deletePost, getPostById, setPostCommentsPolicy } from "../src/core/posts";
import { createSeries, deleteSeries, updateSeries } from "../src/core/series";

describe.skipIf(process.env.RUN_DB_INTEGRATION_TESTS !== "true")("article comments integration", () => {
  test("enforces series controls and publishes only approved comments", async () => {
    const testId = crypto.randomUUID();
    let userId: number | null = null;
    let seriesId: number | null = null;
    let postId: number | null = null;
    try {
      userId = await createUser({ email: `comments-${testId}@example.test`, password: "integration-password-123", displayName: "Moderator", roles: ["owner"] });
      const series = await createSeries({ title: "Comments Series", slug: `comments-series-${testId}`, commentsEnabled: false });
      seriesId = series?.id ?? null;
      if (!seriesId) throw new Error("Series fixture creation failed.");
      const post = await createPost({ title: "Comments Post", slug: `comments-post-${testId}`, bodyHtml: "<p>Body</p>", status: "published", seriesId }, userId);
      postId = post?.id ?? null;
      if (!postId) throw new Error("Post fixture creation failed.");

      await setPostCommentsPolicy(postId, "enabled");
      expect((await getPostById(postId))?.commentsEnabled).toBe(false);
      await updateSeries(seriesId, { title: "Comments Series", slug: `comments-series-${testId}`, commentsEnabled: true });
      expect((await getPostById(postId))?.commentsEnabled).toBe(true);

      const commentId = await createPendingComment(postId, { authorName: "Reader", authorEmail: "reader@example.test", body: "Hello" });
      expect((await listComments("pending")).some((comment) => comment.id === commentId)).toBe(true);
      expect((await listApprovedCommentsForPosts([postId])).get(postId)).toBeUndefined();
      await approveComment(commentId, userId);
      expect((await listApprovedCommentsForPosts([postId])).get(postId)?.[0]?.body).toBe("Hello");
    } finally {
      if (postId) await deletePost(postId);
      if (seriesId) await deleteSeries(seriesId);
      if (userId) await sql`delete from users where id = ${userId}`;
    }
  });
});
