import { createReadStream } from "node:fs";
import { chmod, mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { config } from "./config";
import { createDatabaseBackup } from "./backups";
import { createOperatorNotification } from "./notifications";
import { postgresCommandEnvironmentForUrl } from "../scripts/databaseEnv";
import { runCommand } from "../scripts/runCommand";

type BackupAutomationState = {
  lastAttemptedDate?: string;
  lastSuccessfulDate?: string;
};

const backupPrefix = "hybrid-static-cms-";
const stateName = ".automation-state.json";

export function backupDateKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function isManagedBackupName(name: string) {
  return /^hybrid-static-cms-\d{4}-\d{2}-\d{2}T[\d-]+Z\.sql$/.test(name);
}

async function readState(directory: string): Promise<BackupAutomationState> {
  try {
    const parsed = JSON.parse(await readFile(path.join(directory, stateName), "utf8")) as BackupAutomationState;
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

async function writeState(directory: string, state: BackupAutomationState) {
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, stateName);
  const temporary = path.join(directory, `.${stateName}.${crypto.randomUUID()}.tmp`);
  await writeFile(temporary, `${JSON.stringify(state)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, target);
  await chmod(target, 0o600);
}

export async function rotateLocalBackups(directory: string, retainCount: number) {
  const names = (await readdir(directory).catch(() => []))
    .filter(isManagedBackupName)
    .sort()
    .reverse();
  const expired = names.slice(Math.max(1, retainCount));
  await Promise.all(expired.map((name) => unlink(path.join(directory, name))));
  return expired;
}

function restoreDrillUrl() {
  if (!config.backupRestoreDrillDatabaseUrl) return null;
  const source = new URL(config.databaseUrl);
  const target = new URL(config.backupRestoreDrillDatabaseUrl);
  if (source.pathname === target.pathname && source.hostname === target.hostname && (source.port || "5432") === (target.port || "5432")) {
    throw new Error("BACKUP_RESTORE_DRILL_DATABASE_URL must point to a different database.");
  }
  return config.backupRestoreDrillDatabaseUrl;
}

async function runRestoreDrill(backupPath: string) {
  const databaseUrl = restoreDrillUrl();
  if (!databaseUrl) return false;

  await new Promise<void>((resolve, reject) => {
    const child = spawn("psql", ["--set", "ON_ERROR_STOP=1", "--quiet"], {
      env: postgresCommandEnvironmentForUrl(databaseUrl),
      stdio: ["pipe", "inherit", "inherit"],
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`psql restore drill failed${signal ? ` with signal ${signal}` : ` with exit code ${code ?? "unknown"}`}.`)));
    child.stdin.write("begin;\n");
    const input = createReadStream(backupPath);
    input.once("error", reject);
    input.once("end", () => child.stdin.end("\nrollback;\n"));
    input.pipe(child.stdin, { end: false });
  });
  return true;
}

async function copyOffsite(backupPath: string) {
  const executable = config.backupOffsiteRclonePath;
  const remote = config.backupOffsiteRcloneRemote;
  if (!executable && !remote) return false;
  if (!executable || !remote) throw new Error("Both BACKUP_OFFSITE_RCLONE_PATH and BACKUP_OFFSITE_RCLONE_REMOTE are required for off-site backups.");

  const destination = `${remote}/${path.basename(backupPath)}`;
  await runCommand(executable, ["copyto", backupPath, destination], process.env);
  await runCommand(executable, ["delete", remote, "--include", `${backupPrefix}*.sql`, "--min-age", `${config.backupRetentionCount}d`], process.env);
  return true;
}

export async function runAutomatedBackupIfDue(now = new Date()) {
  if (!config.backupAutomationEnabled || now.getUTCHours() !== config.backupScheduleHourUtc) {
    return { ran: false, reason: "not_due" as const };
  }

  const today = backupDateKey(now);
  const state = await readState(config.backupDirectory);
  if (state.lastAttemptedDate === today) return { ran: false, reason: "already_attempted" as const };

  await writeState(config.backupDirectory, { ...state, lastAttemptedDate: today });
  try {
    const backupPath = await createDatabaseBackup();
    const copiedOffsite = await copyOffsite(backupPath);
    const drillRan = await runRestoreDrill(backupPath);
    const removed = await rotateLocalBackups(config.backupDirectory, config.backupRetentionCount);
    await writeState(config.backupDirectory, { lastAttemptedDate: today, lastSuccessfulDate: today });
    await createOperatorNotification({
      level: "success",
      action: "backup.automated_completed",
      message: `Automated database backup completed${copiedOffsite ? " and was copied off-site" : ""}${drillRan ? "; restore drill passed" : ""}.`,
    }).catch(() => undefined);
    return { ran: true, backupPath, removed, copiedOffsite, drillRan };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown backup automation error";
    await createOperatorNotification({
      level: "error",
      action: "backup.automated_failed",
      message: `Automated database backup failed: ${message.slice(0, 240)}`,
    }).catch(() => undefined);
    throw error;
  }
}
