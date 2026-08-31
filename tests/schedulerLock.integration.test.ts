import { describe, expect, test } from "bun:test";
import { runScheduledJobs } from "../src/core/scheduler";
import { tryAcquireSchedulerLock } from "../src/core/schedulerLock";

describe.skipIf(process.env.RUN_DB_INTEGRATION_TESTS !== "true")("distributed scheduler lock", () => {
  test("allows one scheduler instance at a time and releases the next interval", async () => {
    const first = await tryAcquireSchedulerLock();
    expect(first).not.toBeNull();
    try {
      expect(await tryAcquireSchedulerLock()).toBeNull();
      const skipped = await runScheduledJobs(async () => {
        throw new Error("The renderer must not run while another instance holds the lock.");
      });
      expect(skipped.skippedByLock).toBe(true);
    } finally {
      await first?.release();
    }

    const next = await tryAcquireSchedulerLock();
    expect(next).not.toBeNull();
    await next?.release();
  });
});
