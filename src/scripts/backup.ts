import { chmod, mkdir } from "node:fs/promises";
import path from "node:path";
import { config } from "../core/config";
import { postgresCommandEnvironment, postgresDatabaseName } from "./databaseEnv";
import { runCommand } from "./runCommand";

function argumentValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export async function createBackup(requestedOutput?: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const output = path.resolve(requestedOutput ?? path.join("storage", "backups", `hybrid-static-cms-${timestamp}.sql`));

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
  console.log(`Backup written to ${output}`);
  return output;
}

if (import.meta.main) {
  await createBackup(argumentValue("--output"));
}
