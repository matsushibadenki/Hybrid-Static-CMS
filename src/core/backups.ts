import { chmod, mkdir } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { writeAuditLog } from "./audit";
import { postgresCommandEnvironment, postgresDatabaseName } from "../scripts/databaseEnv";
import { runCommand } from "../scripts/runCommand";

export async function createDatabaseBackup(requestedOutput?: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const output = path.resolve(requestedOutput ?? path.join(config.backupDirectory, `hybrid-static-cms-${timestamp}.sql`));

  await mkdir(path.dirname(output), { recursive: true });
  console.log(`Creating PostgreSQL backup for ${postgresDatabaseName()}...`);
  await runCommand(
    "pg_dump",
    [
      "--dbname",
      postgresDatabaseName(),
      "--format=plain",
      "--no-owner",
      "--no-privileges",
      "--clean",
      "--if-exists",
      "--file",
      output,
    ],
    postgresCommandEnvironment(),
  );
  await chmod(output, 0o600);
  await writeAuditLog({ action: "backup.create", targetType: "database_backup", summary: "Created a PostgreSQL database backup." }).catch(() => undefined);
  console.log(`Backup written to ${output}`);
  return output;
}
