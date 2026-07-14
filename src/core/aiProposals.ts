import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { config } from "./config";
import { sql } from "./db";
import { createFileSnapshot } from "./fileSnapshots";

const allowedExtensions = new Set([".html", ".css", ".js", ".php", ".txt", ".xml", ".md"]);
const protectedPrefixes = [".", "cms/", "uploads/", "storage/", "private/", "secrets/"];

export type AiFileProposal = {
  id: number;
  relativePath: string;
  proposedContent: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  createdBy: number | null;
  reviewedBy: number | null;
  createdAt: string;
  reviewedAt: string | null;
};

function normalizePath(value: string) {
  const normalized = value.trim().replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.startsWith("../") || normalized.includes("/../") || normalized.split("/").some((part) => protectedPrefixes.includes(`${part}/`) || part.startsWith("."))) {
    throw new Error("This path is protected from AI proposals.");
  }
  if (!allowedExtensions.has(path.extname(normalized).toLowerCase())) {
    throw new Error("This file type is not allowed for AI proposals.");
  }
  return normalized;
}

function normalize(row: Record<string, unknown>): AiFileProposal {
  return {
    id: Number(row.id),
    relativePath: String(row.relative_path),
    proposedContent: String(row.proposed_content),
    reason: String(row.reason),
    status: row.status as AiFileProposal["status"],
    createdBy: row.created_by ? Number(row.created_by) : null,
    reviewedBy: row.reviewed_by ? Number(row.reviewed_by) : null,
    createdAt: String(row.created_at),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
  };
}

export async function createAiFileProposal(input: { relativePath: string; proposedContent: string; reason: string }, createdBy: number | null) {
  const relativePath = normalizePath(input.relativePath);
  if (!input.reason.trim()) throw new Error("A proposal reason is required.");
  if (input.proposedContent.length > 2_000_000) throw new Error("Proposal content is too large.");
  const rows = await sql`
    insert into ai_file_proposals (relative_path, proposed_content, reason, created_by)
    values (${relativePath}, ${input.proposedContent}, ${input.reason.trim()}, ${createdBy})
    returning *
  `;
  return normalize(rows[0] as Record<string, unknown>);
}

export async function listAiFileProposals(status: "pending" | "approved" | "rejected" | "any" = "pending") {
  const rows = status === "any"
    ? await sql`select * from ai_file_proposals order by created_at desc, id desc limit 200`
    : await sql`select * from ai_file_proposals where status = ${status} order by created_at desc, id desc limit 200`;
  return rows.map((row) => normalize(row as Record<string, unknown>));
}

export async function getAiFileProposal(id: number) {
  const rows = await sql`select * from ai_file_proposals where id = ${id} limit 1`;
  return rows[0] ? normalize(rows[0] as Record<string, unknown>) : null;
}

export async function getAiProposalDiff(proposal: AiFileProposal) {
  const currentPath = path.join(config.publicHtmlDir, normalizePath(proposal.relativePath));
  let currentContent = "";
  try { currentContent = await readFile(currentPath, "utf8"); } catch { /* New file. */ }
  const proposedLines = proposal.proposedContent.split("\n");
  const currentLines = currentContent.split("\n");
  const total = Math.max(proposedLines.length, currentLines.length);
  return Array.from({ length: total }, (_, index) => ({
    lineNumber: index + 1,
    proposed: proposedLines[index] ?? "",
    current: currentLines[index] ?? "",
    changed: proposedLines[index] !== currentLines[index],
  }));
}

export async function reviewAiFileProposal(id: number, status: "approved" | "rejected", reviewerId: number) {
  const proposal = await getAiFileProposal(id);
  if (!proposal || proposal.status !== "pending") throw new Error("Pending proposal not found.");
  if (status === "rejected") {
    await sql`update ai_file_proposals set status = 'rejected', reviewed_by = ${reviewerId}, reviewed_at = now() where id = ${id}`;
    return { proposal, snapshotId: null };
  }

  const absolutePath = path.join(config.publicHtmlDir, normalizePath(proposal.relativePath));
  let snapshotId: number | null = null;
  try {
    const snapshot = await createFileSnapshot(proposal.relativePath, reviewerId, `Automatic backup before approving AI proposal #${id}`);
    snapshotId = snapshot?.id ?? null;
  } catch { /* New files do not have a current snapshot. */ }
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, proposal.proposedContent, "utf8");
  await sql`update ai_file_proposals set status = 'approved', reviewed_by = ${reviewerId}, reviewed_at = now() where id = ${id}`;
  return { proposal, snapshotId };
}
