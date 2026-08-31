import { describe, expect, test } from "bun:test";
import { enqueuePublicRender, processBackgroundJobs } from "../src/core/backgroundJobs";

describe.skipIf(process.env.RUN_DB_INTEGRATION_TESTS !== "true")("background jobs", () => {
  test("coalesces public rendering requests and completes one queued job", async () => {
    const first = await enqueuePublicRender();
    const second = await enqueuePublicRender();
    expect(second.id).toBe(first.id);
    const result = await processBackgroundJobs();
    expect(result.succeeded).toBe(true);
  });
});
