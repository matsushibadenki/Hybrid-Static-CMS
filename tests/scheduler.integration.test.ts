import { describe, expect, test } from "bun:test";
import { createUser } from "../src/core/auth";
import { sql } from "../src/core/db";
import { createPost, deletePost, getPostById } from "../src/core/posts";
import { runScheduledJobs } from "../src/core/scheduler";

describe.skipIf(process.env.RUN_DB_INTEGRATION_TESTS !== "true")("scheduled publishing retries", () => {
  test("queues a retry after rendering fails and clears it after recovery", async () => {
    const testId = crypto.randomUUID();
    let userId: number | null = null;
    let postId: number | null = null;
    try {
      userId = await createUser({
        email: `scheduler-${testId}@example.test`,
        password: "integration-password-123",
        displayName: "Scheduler",
        roles: ["owner"],
      });
      const post = await createPost({
        title: "Scheduled retry",
        slug: `scheduled-retry-${testId}`,
        bodyHtml: "<p>Scheduled</p>",
        status: "scheduled",
        publishedAt: new Date(Date.now() - 60_000).toISOString(),
      }, userId);
      postId = post?.id ?? null;
      if (!postId) throw new Error("Post fixture creation failed.");

      const failed = await runScheduledJobs(async () => {
        throw new Error("fixture render failure");
      });
      expect(failed.retryQueued).toBe(true);
      const failedRows = await sql`select status, scheduled_publish_attempts, scheduled_publish_next_retry_at, scheduled_publish_last_error from posts where id = ${postId}`;
      expect(failedRows[0].status).toBe("scheduled");
      expect(Number(failedRows[0].scheduled_publish_attempts)).toBe(1);
      expect(failedRows[0].scheduled_publish_next_retry_at).toBeTruthy();
      expect(String(failedRows[0].scheduled_publish_last_error)).toContain("fixture render failure");

      await sql`update posts set scheduled_publish_next_retry_at = now() - interval '1 second' where id = ${postId}`;
      const recovered = await runScheduledJobs(async () => undefined);
      expect(recovered.publishedPosts).toBe(1);
      expect((await getPostById(postId))?.status).toBe("published");
      const recoveredRows = await sql`select scheduled_publish_attempts, scheduled_publish_next_retry_at, scheduled_publish_last_error from posts where id = ${postId}`;
      expect(Number(recoveredRows[0].scheduled_publish_attempts)).toBe(0);
      expect(recoveredRows[0].scheduled_publish_next_retry_at).toBeNull();
      expect(recoveredRows[0].scheduled_publish_last_error).toBeNull();
    } finally {
      if (postId) await deletePost(postId);
      if (userId) await sql`delete from users where id = ${userId}`;
    }
  });
});
