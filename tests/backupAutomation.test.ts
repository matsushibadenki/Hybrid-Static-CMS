import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { backupDateKey, isManagedBackupName, rotateLocalBackups } from "../src/core/backupAutomation";
import { parseRcloneRemote } from "../src/core/config";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("automated backups", () => {
  test("keeps the newest managed SQL generations without touching other files", async () => {
    const directory = path.join("/tmp", `hybrid-static-cms-backups-${crypto.randomUUID()}`);
    directories.push(directory);
    await mkdir(directory, { recursive: true });
    const names = [
      "hybrid-static-cms-2026-01-01T00-00-00-000Z.sql",
      "hybrid-static-cms-2026-01-02T00-00-00-000Z.sql",
      "hybrid-static-cms-2026-01-03T00-00-00-000Z.sql",
      "notes.txt",
    ];
    await Promise.all(names.map((name) => writeFile(path.join(directory, name), "fixture")));
    const removed = await rotateLocalBackups(directory, 2);
    expect(removed).toEqual(["hybrid-static-cms-2026-01-01T00-00-00-000Z.sql"]);
    expect(await Bun.file(path.join(directory, "hybrid-static-cms-2026-01-03T00-00-00-000Z.sql")).exists()).toBe(true);
    expect(await Bun.file(path.join(directory, "notes.txt")).exists()).toBe(true);
  });

  test("accepts only a safe rclone remote and stable UTC date keys", () => {
    expect(isManagedBackupName("hybrid-static-cms-2026-01-03T00-00-00-000Z.sql")).toBe(true);
    expect(isManagedBackupName("../../backup.sql")).toBe(false);
    expect(parseRcloneRemote("backup-remote:cms/postgres")).toBe("backup-remote:cms/postgres");
    expect(parseRcloneRemote("backup-remote:\nunsafe")).toBeNull();
    expect(backupDateKey(new Date("2026-01-03T23:59:59.000Z"))).toBe("2026-01-03");
  });
});
