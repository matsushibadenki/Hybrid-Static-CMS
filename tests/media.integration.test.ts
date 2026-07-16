import { describe, expect, test } from "bun:test";
import { createUser } from "../src/core/auth";
import { sql } from "../src/core/db";
import { config } from "../src/core/config";
import { deleteMedia, uploadMedia } from "../src/core/media";
import path from "node:path";

const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
let userId: number | null = null;
let mediaId: number | null = null;
let storedName: string | null = null;

describe.skipIf(process.env.RUN_DB_INTEGRATION_TESTS !== "true")("media integration", () => {
  test("stores and removes a content-validated media file", async () => {
    try {
      userId = await createUser({
        email: `media-${crypto.randomUUID()}@example.test`,
        password: "integration-password-123",
        displayName: "Media User",
        roles: ["owner"],
      });
      const media = await uploadMedia(new File([pngHeader], "integration.png", { type: "image/png" }), "Integration image", userId);
      expect(media).not.toBeNull();
      mediaId = media?.id ?? null;
      storedName = media?.storedName ?? null;
      expect(media?.mimeType).toBe("image/png");
      expect(await Bun.file(path.join(config.cmsUploadDir, storedName ?? "")).exists()).toBe(true);

      await deleteMedia(mediaId ?? 0);
      expect(await Bun.file(path.join(config.cmsUploadDir, storedName ?? "")).exists()).toBe(false);
    } finally {
      if (mediaId) await deleteMedia(mediaId);
      if (userId) await sql`delete from users where id = ${userId}`;
    }
  });
});
