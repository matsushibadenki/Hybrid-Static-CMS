import { describe, expect, test } from "bun:test";
import { createUser } from "../src/core/auth";
import { createApiKey, revokeApiKey } from "../src/core/apiKeys";
import { sql } from "../src/core/db";
import { deletePost } from "../src/core/posts";
import { createApp } from "../src/server/app";

describe.skipIf(process.env.RUN_DB_INTEGRATION_TESTS !== "true")("scoped API keys", () => {
  test("accepts a scoped draft request, rejects publishing, and rejects a revoked key", async () => {
    const testId = crypto.randomUUID();
    const app = createApp();
    let userId: number | null = null;
    let postId: number | null = null;
    try {
      userId = await createUser({
        email: `api-key-owner-${testId}@example.test`,
        password: "integration-password-123",
        displayName: "API Key Owner",
        roles: ["owner"],
      });
      const key = await createApiKey(userId, { name: "Draft deployment", permissions: ["posts.write"] });
      expect(key.token).toMatch(/^hsc_[A-Za-z0-9_-]{12}_[A-Za-z0-9_-]{40,128}$/);
      const stored = await sql`select secret_hash from api_keys where id = ${key.record.id}`;
      expect(String(stored[0]?.secret_hash)).not.toContain(key.token);

      const draftResponse = await app.request("http://localhost/cms-api/posts", {
        method: "POST",
        headers: { Authorization: `Bearer ${key.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: "API key draft", slug: `api-key-draft-${testId}`, bodyHtml: "<p>Draft</p>", status: "draft" }),
      });
      expect(draftResponse.status).toBe(201);
      postId = Number((await draftResponse.json()).id);

      const publishResponse = await app.request("http://localhost/cms-api/posts", {
        method: "POST",
        headers: { Authorization: `Bearer ${key.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: "API key publish", slug: `api-key-publish-${testId}`, bodyHtml: "<p>Published</p>", status: "published" }),
      });
      expect(publishResponse.status).toBe(403);

      expect(await revokeApiKey(key.record.id, userId)).toBe(true);
      const revokedResponse = await app.request("http://localhost/cms-api/posts", {
        method: "POST",
        headers: { Authorization: `Bearer ${key.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Revoked", slug: `api-key-revoked-${testId}`, bodyHtml: "<p>Revoked</p>", status: "draft" }),
      });
      expect(revokedResponse.status).toBe(401);
    } finally {
      if (postId) await deletePost(postId);
      if (userId) await sql`delete from users where id = ${userId}`;
    }
  });
});
