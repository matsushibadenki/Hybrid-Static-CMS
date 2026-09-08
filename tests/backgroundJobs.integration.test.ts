import { describe, expect, test } from "bun:test";
import { enqueueMediaVariantRegeneration, enqueuePublicRender, processBackgroundJobs } from "../src/core/backgroundJobs";
import { sql } from "../src/core/db";

describe.skipIf(process.env.RUN_DB_INTEGRATION_TESTS !== "true")("background jobs", () => {
  test("coalesces public rendering requests and completes one queued job", async () => {
    const first = await enqueuePublicRender();
    const second = await enqueuePublicRender();
    expect(second.id).toBe(first.id);
    const result = await processBackgroundJobs();
    expect(result.succeeded).toBe(true);
    expect(result.jobId).toBe(first.id);
  });

  test("coalesces media variant requests for the same media item", async () => {
    const mediaId = Math.floor(Math.random() * 1_000_000_000) + 1;
    const first = await enqueueMediaVariantRegeneration(mediaId);
    let otherId: number | undefined;
    try {
      const second = await enqueueMediaVariantRegeneration(mediaId);
      expect(second.id).toBe(first.id);
      expect(second.jobType).toBe("regenerate_media_variants");
      expect(second.payload.mediaId).toBe(mediaId);
      const other = await enqueueMediaVariantRegeneration(mediaId + 1);
      otherId = other.id;
      expect(other.id).not.toBe(first.id);
    } finally {
      await sql`delete from background_jobs where id = ${first.id}`;
      if (otherId !== undefined) await sql`delete from background_jobs where id = ${otherId}`;
    }
  });
});
