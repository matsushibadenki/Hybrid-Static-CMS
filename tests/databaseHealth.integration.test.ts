import { describe, expect, test } from "bun:test";
import { getDatabaseHealth, runDatabaseAnalyze } from "../src/core/databaseHealth";

describe.skipIf(process.env.RUN_DB_INTEGRATION_TESTS !== "true")("database health", () => {
  test("reads privacy-safe PostgreSQL health statistics and refreshes planner statistics", async () => {
    const health = await getDatabaseHealth();
    expect(health.version).toContain("PostgreSQL");
    expect(health.databaseSizeBytes).toBeGreaterThan(0);
    expect(health.maxConnections).toBeGreaterThan(0);
    expect(Array.isArray(health.tables)).toBe(true);
    await expect(runDatabaseAnalyze()).resolves.toBeUndefined();
  });
});
