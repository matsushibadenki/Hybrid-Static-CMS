import { access, stat } from "node:fs/promises";
import path from "node:path";
import { config } from "../core/config";
import { postgresCommandEnvironment, postgresDatabaseName } from "./databaseEnv";
import { runCommand } from "./runCommand";

function argumentValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const inputValue = argumentValue("--input");
if (!inputValue) {
  throw new Error("Usage: bun run db:restore -- --input path/to/backup.sql --confirm");
}

if (!process.argv.includes("--confirm")) {
  throw new Error("Database restore is destructive. Add --confirm to continue.");
}

const input = path.resolve(inputValue);
await access(input);
if (!(await stat(input)).isFile()) {
  throw new Error(`Backup input is not a file: ${input}`);
}

console.log(`Restoring PostgreSQL backup into ${postgresDatabaseName()}...`);
console.log("Existing tables included in the backup may be replaced.");

await runCommand(
  "psql",
  [
    "--dbname",
    postgresDatabaseName(),
    "--set",
    "ON_ERROR_STOP=1",
    "--file",
    input,
  ],
  postgresCommandEnvironment(),
);

console.log(`Database restore completed from ${input}`);
