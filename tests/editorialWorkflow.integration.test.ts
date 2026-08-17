import { describe, expect, test } from "bun:test";
import { createUser } from "../src/core/auth";
import { sql } from "../src/core/db";
import {
  approveContentReview,
  listEditorialWorkflowEvents,
  requestContentChanges,
  submitContentForReview,
  withdrawContentReview,
} from "../src/core/editorialWorkflow";
import { createPost, deletePost, getPostById, updatePost } from "../src/core/posts";
import { AppValidationError } from "../src/core/validation";

describe.skipIf(process.env.RUN_DB_INTEGRATION_TESTS !== "true")("editorial workflow integration", () => {
  test("blocks publishing during review and invalidates approval after an edit", async () => {
    const testId = crypto.randomUUID();
    let authorId: number | null = null;
    let reviewerId: number | null = null;
    let postId: number | null = null;
    const input = {
      title: "Review fixture",
      slug: `review-${testId}`,
      excerpt: "Workflow fixture",
      bodyHtml: "<p>Approved body</p>",
      status: "draft" as const,
      categorySlugs: ["review"],
      tagSlugs: ["workflow"],
    };

    try {
      authorId = await createUser({ email: `workflow-author-${testId}@example.test`, password: "integration-password-123", displayName: "Workflow Author", roles: ["author"] });
      reviewerId = await createUser({ email: `workflow-reviewer-${testId}@example.test`, password: "integration-password-123", displayName: "Workflow Reviewer", roles: ["editor"] });
      const post = await createPost(input, authorId);
      postId = post?.id ?? null;
      if (!postId) throw new Error("Post fixture creation failed.");

      await submitContentForReview("post", postId, authorId, "Ready for review");
      expect((await getPostById(postId))?.workflowState).toBe("in_review");
      await expect(updatePost(postId, { ...input, status: "published" }, authorId)).rejects.toBeInstanceOf(AppValidationError);

      await approveContentReview("post", postId, reviewerId, "Approved");
      expect((await getPostById(postId))?.workflowState).toBe("approved");
      await updatePost(postId, { ...input, status: "published" }, authorId);
      expect((await getPostById(postId))?.workflowState).toBe("approved");

      await updatePost(postId, { ...input, bodyHtml: "<p>Changed after approval</p>" }, authorId);
      expect((await getPostById(postId))?.workflowState).toBe("draft");

      await submitContentForReview("post", postId, authorId);
      await requestContentChanges("post", postId, reviewerId, "Clarify the conclusion");
      expect((await getPostById(postId))?.workflowState).toBe("changes_requested");
      await submitContentForReview("post", postId, authorId);
      await withdrawContentReview("post", postId, authorId);
      expect((await getPostById(postId))?.workflowState).toBe("draft");
      expect((await listEditorialWorkflowEvents("post", postId)).map((event) => event.action)).toEqual([
        "withdraw", "submit", "request_changes", "submit", "approve", "submit",
      ]);
    } finally {
      if (postId) await deletePost(postId);
      if (authorId || reviewerId) await sql`delete from users where id in (${authorId}, ${reviewerId})`;
    }
  });
});
