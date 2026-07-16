import { unlink } from "node:fs/promises";
import { describe, expect, test } from "bun:test";
import { createBackup } from "../src/scripts/backup";

describe.skipIf(process.env.RUN_DB_INTEGRATION_TESTS !== "true")("backup integration", () => {
  test("creates a protected plain-SQL PostgreSQL backup", async () => {
    const output = `/tmp/hybrid-static-cms-integration-${crypto.randomUUID()}.sql`;
    try {
      const backupPath = await createBackup(output);
      const file = Bun.file(backupPath);
      expect(await file.exists()).toBe(true);
      expect((await file.text()).length).toBeGreaterThan(100);
      expect(await file.text()).toContain("CREATE TABLE");
    } finally {
      await unlink(output).catch(() => undefined);
    }
  });
});
