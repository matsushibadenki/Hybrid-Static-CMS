import { describe, expect, test } from "bun:test";
import postgres from "postgres";
import { unlink } from "node:fs/promises";
import { createBackup } from "../src/scripts/backup";
import { restoreBackup } from "../src/scripts/restore";
import { postgresCommandEnvironment, postgresDatabaseName } from "../src/scripts/databaseEnv";
import { runCommand } from "../src/scripts/runCommand";

describe.skipIf(process.env.RUN_DB_INTEGRATION_TESTS !== "true")("restore integration", () => {
  test("restores a plain-SQL backup into an isolated temporary database", async () => {
    const database = `hybrid_static_cms_restore_${crypto.randomUUID().replaceAll("-", "")}`;
    const backup = `/tmp/hybrid-static-cms-restore-${crypto.randomUUID()}.sql`;
    const environment = postgresCommandEnvironment("postgres");
    let targetSql: postgres.Sql | null = null;
    try {
      await runCommand("createdb", [database], environment);
      await createBackup(backup);
      await restoreBackup(backup, database);
      const sourceUrl = new URL(process.env.DATABASE_URL!);
      sourceUrl.pathname = `/${database}`;
      targetSql = postgres(sourceUrl.toString(), { max: 1 });
      const rows = await targetSql`select to_regclass('public.users') as users_table, to_regclass('public.posts') as posts_table`;
      expect(rows[0].users_table).toBe("users");
      expect(rows[0].posts_table).toBe("posts");
      expect(postgresDatabaseName(database)).toBe(database);
    } finally {
      await targetSql?.end({ timeout: 2 });
      await runCommand("dropdb", ["--if-exists", database], environment).catch(() => undefined);
      await unlink(backup).catch(() => undefined);
    }
  });
});
