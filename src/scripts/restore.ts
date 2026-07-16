import { access, stat } from "node:fs/promises";
import path from "node:path";
import { config } from "../core/config";
import { postgresCommandEnvironment, postgresDatabaseName } from "./databaseEnv";
import { runCommand } from "./runCommand";

function argumentValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export async function restoreBackup(inputValue: string, targetDatabase?: string) {
  const input = path.resolve(inputValue);
  await access(input);
  if (!(await stat(input)).isFile()) {
    throw new Error(`Backup input is not a file: ${input}`);
  }
  const database = postgresDatabaseName(targetDatabase);
  console.log(`Restoring PostgreSQL backup into ${database}...`);
  console.log("Existing tables included in the backup may be replaced.");
  await runCommand(
    "psql",
    [
      "--dbname",
      database,
      "--set",
      "ON_ERROR_STOP=1",
      "--file",
      input,
    ],
    postgresCommandEnvironment(database),
  );
  console.log(`Database restore completed from ${input}`);
}

if (import.meta.main) {
  const inputValue = argumentValue("--input");
  if (!inputValue) {
    throw new Error("Usage: bun run db:restore -- --input path/to/backup.sql --confirm");
  }
  if (!process.argv.includes("--confirm")) {
    throw new Error("Database restore is destructive. Add --confirm to continue.");
  }
  await restoreBackup(inputValue);
}
