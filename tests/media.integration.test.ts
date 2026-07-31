import { describe, expect, test } from "bun:test";
import { createUser } from "../src/core/auth";
import { sql } from "../src/core/db";
import { config } from "../src/core/config";
import { deleteMedia, getMediaStorageUsage, uploadMedia } from "../src/core/media";
import { createBlock, deleteBlock } from "../src/core/blocks";
import path from "node:path";

const pngFile = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
));
let userId: number | null = null;
let mediaId: number | null = null;
let storedName: string | null = null;
let variantNames: string[] = [];

describe.skipIf(process.env.RUN_DB_INTEGRATION_TESTS !== "true")("media integration", () => {
  test("stores and removes a content-validated media file", async () => {
    try {
      userId = await createUser({
        email: `media-${crypto.randomUUID()}@example.test`,
        password: "integration-password-123",
        displayName: "Media User",
        roles: ["owner"],
      });
      const media = await uploadMedia(new File([pngFile], "integration.html", { type: "image/png" }), "Integration image", userId);
      expect(media).not.toBeNull();
      mediaId = media?.id ?? null;
      storedName = media?.storedName ?? null;
      expect(media?.mimeType).toBe("image/png");
      expect(media?.storedName.endsWith(".png")).toBe(true);
      expect(media?.storedName.endsWith(".html")).toBe(false);
      expect(media?.width).toBe(1);
      expect(media?.height).toBe(1);
      expect(media?.variants.map((variant) => `${variant.kind}:${variant.format}`)).toEqual([
        "display:png",
        "responsive:avif",
        "responsive:webp",
        "thumbnail:webp",
      ]);
      variantNames = media?.variants.map((variant) => variant.storedName) ?? [];
      expect(await Bun.file(path.join(config.cmsUploadDir, storedName ?? "")).exists()).toBe(true);
      for (const variantName of variantNames) {
        expect(await Bun.file(path.join(config.cmsUploadDir, variantName)).exists()).toBe(true);
      }
      const usage = await getMediaStorageUsage(userId);
      const expectedUsage = pngFile.byteLength + (media?.variants.reduce((total, variant) => total + variant.sizeBytes, 0) ?? 0);
      expect(usage.userUsedBytes).toBe(expectedUsage);
      expect(usage.uploadAllowed).toBe(true);

      await deleteMedia(mediaId ?? 0);
      expect(await Bun.file(path.join(config.cmsUploadDir, storedName ?? "")).exists()).toBe(false);
      for (const variantName of variantNames) {
        expect(await Bun.file(path.join(config.cmsUploadDir, variantName)).exists()).toBe(false);
      }
    } finally {
      if (mediaId) await deleteMedia(mediaId);
      if (userId) await sql`delete from users where id = ${userId}`;
    }
  });

  test("refuses deletion while CMS content references the media", async () => {
    let localUserId: number | null = null;
    let localMediaId: number | null = null;
    let blockId: number | null = null;
    try {
      localUserId = await createUser({
        email: `media-reference-${crypto.randomUUID()}@example.test`,
        password: "integration-password-123",
        displayName: "Media Reference User",
        roles: ["owner"],
      });
      const media = await uploadMedia(new File([pngFile], "referenced.png", { type: "image/png" }), "", localUserId);
      localMediaId = media?.id ?? null;
      const block = await createBlock({
        title: "Media reference",
        slug: `media-reference-${crypto.randomUUID()}`,
        bodyHtml: `<img src="${media?.publicUrl}">`,
        status: "draft",
      }, localUserId);
      blockId = block?.id ?? null;

      await expect(deleteMedia(localMediaId ?? 0)).rejects.toThrow("Referenced media cannot be deleted");
      if (blockId) {
        await deleteBlock(blockId);
        blockId = null;
      }
      await expect(deleteMedia(localMediaId ?? 0)).resolves.toBe(true);
      localMediaId = null;
    } finally {
      if (blockId) await deleteBlock(blockId);
      if (localMediaId) {
        await sql`delete from media_files where id = ${localMediaId}`;
      }
      if (localUserId) await sql`delete from users where id = ${localUserId}`;
    }
  });
});
