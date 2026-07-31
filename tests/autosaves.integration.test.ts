import { describe, expect, test } from "bun:test";
import { createUser } from "../src/core/auth";
import { deleteEditorAutosave, getEditorAutosave, saveEditorAutosave } from "../src/core/autosaves";
import { sql } from "../src/core/db";

const email = `autosave-${crypto.randomUUID()}@example.test`;
let userId: number | null = null;

describe.skipIf(process.env.RUN_DB_INTEGRATION_TESTS !== "true")("editor autosaves integration", () => {
  test("stores a private filtered recovery copy and deletes it after use", async () => {
    try {
      userId = await createUser({
        email,
        password: "autosave-integration-password",
        displayName: "Autosave User",
        roles: ["author"],
      });
      const baseUpdatedAt = new Date("2026-07-31T00:00:00.000Z").toISOString();
      const updatedAt = await saveEditorAutosave(userId, "post", "new-test-draft", {
        title: "Recovered title",
        bodyHtml: "<p>Recovered body</p>",
        seoNoindex: true,
        ignoredField: "must not be stored",
      }, baseUpdatedAt);
      expect(new Date(updatedAt).getTime()).toBeGreaterThan(0);

      const autosave = await getEditorAutosave(userId, "post", "new-test-draft");
      expect(autosave?.payload).toEqual({
        title: "Recovered title",
        bodyHtml: "<p>Recovered body</p>",
        seoNoindex: true,
      });
      expect(autosave?.baseUpdatedAt).toBe(baseUpdatedAt);

      await deleteEditorAutosave(userId, "post", "new-test-draft");
      expect(await getEditorAutosave(userId, "post", "new-test-draft")).toBeNull();
    } finally {
      if (userId) await sql`delete from users where id = ${userId}`;
    }
  });
});
