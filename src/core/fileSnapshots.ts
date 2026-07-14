import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { config } from "./config";
import { sql } from "./db";

export type FileSnapshotRecord = {
  id: number;
  relativePath: string;
  fileType: string;
  reason: string | null;
  contentPreview: string;
  createdAt: string;
  creatorName: string | null;
  creatorUserId: number | null;
};

export type FileSnapshotDiffLine = {
  lineNumber: number;
  snapshotLine: string;
  currentLine: string;
  status: "same" | "changed" | "added" | "removed";
};

export type FileSnapshotDiff = {
  snapshotId: number;
  relativePath: string;
  reason: string | null;
  currentExists: boolean;
  lines: FileSnapshotDiffLine[];
};

const allowedExtensions = new Set([".html", ".css", ".js", ".php", ".txt", ".xml", ".md"]);

function normalizeSnapshot(row: Record<string, unknown>): FileSnapshotRecord {
  const content = String(row.content ?? "");
  return {
    id: Number(row.id),
    relativePath: String(row.relative_path),
    fileType: String(row.file_type),
    reason: (row.reason as string | null) ?? null,
    contentPreview: content.length > 180 ? `${content.slice(0, 180)}...` : content,
    createdAt: String(row.created_at),
    creatorName: (row.creator_name as string | null) ?? null,
    creatorUserId: row.created_by ? Number(row.created_by) : null,
  };
}

function ensureAllowedPath(relativePath: string) {
  const trimmed = relativePath.trim().replaceAll("\\", "/").replace(/^\/+/, "");
  if (!trimmed) {
    throw new Error("A relative path is required.");
  }
  if (trimmed.startsWith("../") || trimmed.includes("/../") || trimmed === "..") {
    throw new Error("Parent directory traversal is not allowed.");
  }

  const ext = path.extname(trimmed).toLowerCase();
  if (!allowedExtensions.has(ext)) {
    throw new Error(`Unsupported file type for snapshots: ${ext || "none"}`);
  }

  return trimmed;
}

function snapshotAbsolutePath(relativePath: string) {
  const normalized = ensureAllowedPath(relativePath);
  return path.join(config.publicHtmlDir, normalized);
}

export async function createFileSnapshot(relativePath: string, createdBy: number | null, reason?: string) {
  const normalized = ensureAllowedPath(relativePath);
  const absolutePath = snapshotAbsolutePath(normalized);
  const content = await readFile(absolutePath, "utf8");
  const fileType = path.extname(normalized).slice(1) || "text";

  return insertFileSnapshot(normalized, fileType, content, createdBy, reason);
}

async function insertFileSnapshot(
  normalized: string,
  fileType: string,
  content: string,
  createdBy: number | null,
  reason?: string,
) {

  const rows = await sql`
    insert into file_snapshots (
      relative_path,
      file_type,
      content,
      reason,
      created_by
    ) values (
      ${normalized},
      ${fileType},
      ${content},
      ${reason?.trim() || null},
      ${createdBy}
    )
    returning id
  `;

  return getFileSnapshotById(Number(rows[0].id));
}

export async function listFileSnapshots(limit = 100) {
  const rows = await sql`
    select
      fs.id,
      fs.relative_path,
      fs.file_type,
      fs.content,
      fs.reason,
      fs.created_by,
      fs.created_at,
      u.display_name as creator_name
    from file_snapshots fs
    left join users u on u.id = fs.created_by
    order by fs.created_at desc, fs.id desc
    limit ${limit}
  `;

  return rows.map((row) => normalizeSnapshot(row as Record<string, unknown>));
}

export async function getFileSnapshotById(id: number) {
  const rows = await sql`
    select
      fs.id,
      fs.relative_path,
      fs.file_type,
      fs.content,
      fs.reason,
      fs.created_by,
      fs.created_at,
      u.display_name as creator_name
    from file_snapshots fs
    left join users u on u.id = fs.created_by
    where fs.id = ${id}
    limit 1
  `;

  return rows[0] ? normalizeSnapshot(rows[0] as Record<string, unknown>) : null;
}

async function readCurrentContent(relativePath: string) {
  try {
    return await readFile(snapshotAbsolutePath(relativePath), "utf8");
  } catch {
    return null;
  }
}

export async function getFileSnapshotDiff(snapshotId: number): Promise<FileSnapshotDiff> {
  const rows = await sql`
    select id, relative_path, content, reason
    from file_snapshots
    where id = ${snapshotId}
    limit 1
  `;
  const row = rows[0];
  if (!row) {
    throw new Error("Snapshot not found.");
  }

  const relativePath = ensureAllowedPath(String(row.relative_path));
  const snapshotContent = String(row.content);
  const currentContent = await readCurrentContent(relativePath);
  const snapshotLines = snapshotContent.split("\n");
  const currentLines = (currentContent ?? "").split("\n");
  const total = Math.max(snapshotLines.length, currentLines.length);

  const lines: FileSnapshotDiffLine[] = [];
  for (let index = 0; index < total; index += 1) {
    const snapshotLine = snapshotLines[index] ?? "";
    const currentLine = currentLines[index] ?? "";
    let status: FileSnapshotDiffLine["status"] = "same";

    if (index >= currentLines.length) {
      status = "removed";
    } else if (index >= snapshotLines.length) {
      status = "added";
    } else if (snapshotLine !== currentLine) {
      status = "changed";
    }

    lines.push({
      lineNumber: index + 1,
      snapshotLine,
      currentLine,
      status,
    });
  }

  return {
    snapshotId: Number(row.id),
    relativePath,
    reason: (row.reason as string | null) ?? null,
    currentExists: currentContent !== null,
    lines,
  };
}

export async function restoreFileSnapshot(snapshotId: number, restoredBy: number | null = null) {
  const rows = await sql`
    select id, relative_path, content
    from file_snapshots
    where id = ${snapshotId}
    limit 1
  `;
  const row = rows[0];
  if (!row) {
    throw new Error("Snapshot not found.");
  }

  const normalized = ensureAllowedPath(String(row.relative_path));
  const absolutePath = snapshotAbsolutePath(normalized);
  const currentContent = await readCurrentContent(normalized);
  let rollbackSnapshotId: number | null = null;
  if (currentContent !== null) {
    const rollback = await insertFileSnapshot(
      normalized,
      path.extname(normalized).slice(1) || "text",
      currentContent,
      restoredBy,
      `Automatic rollback before restoring snapshot #${snapshotId}`,
    );
    rollbackSnapshotId = rollback?.id ?? null;
  }
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, String(row.content), "utf8");

  return {
    id: Number(row.id),
    relativePath: normalized,
    rollbackSnapshotId,
  };
}
