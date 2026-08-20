import { describe, expect, test } from "bun:test";
import { createBlock, deleteBlock, expandPublishedBlocks, getBlockById } from "../src/core/blocks";
import { sql } from "../src/core/db";
import { createManagedUser } from "../src/core/users";

describe.skipIf(process.env.RUN_DB_INTEGRATION_TESTS !== "true")("visual content block integration", () => {
  test("persists and expands a published responsive layout", async () => {
    let userId: number | null = null;
    let blockId: number | null = null;
    const slug = `layout-${crypto.randomUUID()}`;
    try {
      userId = await createManagedUser({ email: `${slug}@example.test`, password: "integration-password-123", displayName: "Layout Test", roles: ["owner"] });
      const block = await createBlock({ title: "Responsive layout", slug, bodyHtml: "<div>Left</div><div>Right</div>", layoutType: "split", status: "published" }, userId);
      blockId = block?.id ?? null;

      expect((await getBlockById(blockId ?? 0))?.layoutType).toBe("split");
      const expanded = await expandPublishedBlocks(`<p>Before</p>[[block:${slug}]]<p>After</p>`);
      expect(expanded).toContain('class="hsc-layout-block hsc-layout-block--split"');
      expect(expanded).toContain("<div>Left</div><div>Right</div>");
    } finally {
      if (blockId) await deleteBlock(blockId);
      if (userId) await sql`delete from users where id = ${userId}`;
    }
  });
});
