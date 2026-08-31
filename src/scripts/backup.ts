import { createDatabaseBackup } from "../core/backups";

function argumentValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export async function createBackup(requestedOutput?: string) {
  return createDatabaseBackup(requestedOutput);
}

if (import.meta.main) {
  await createBackup(argumentValue("--output"));
}
