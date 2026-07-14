import { sanitizeRichHtml, escapeHtml } from "./content";
import { sql } from "./db";
import { AppValidationError, isUniqueConstraintError, requireNonEmpty, validateSlug } from "./validation";

export type ContentBlock = {
  id: number;
  title: string;
  slug: string;
  bodyHtml: string;
  status: "draft" | "published";
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
};

function normalize(row: Record<string, unknown>): ContentBlock {
  return {
    id: Number(row.id),
    title: String(row.title),
    slug: String(row.slug),
    bodyHtml: String(row.body_html ?? ""),
    status: row.status as ContentBlock["status"],
    createdBy: row.created_by ? Number(row.created_by) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function validateInput(input: { title: string; slug: string; bodyHtml: string }) {
  requireNonEmpty(input.title, "Title");
  validateSlug(input.slug);
  requireNonEmpty(input.bodyHtml, "Body HTML");
}

export async function listBlocks(status: "draft" | "published" | "any" = "any") {
  const rows = status === "any"
    ? await sql`select * from content_blocks order by updated_at desc, id desc`
    : await sql`select * from content_blocks where status = ${status} order by updated_at desc, id desc`;
  return rows.map((row) => normalize(row as Record<string, unknown>));
}

export async function getBlockById(id: number) {
  const rows = await sql`select * from content_blocks where id = ${id} limit 1`;
  return rows[0] ? normalize(rows[0] as Record<string, unknown>) : null;
}

export async function getPublishedBlockBySlug(slug: string) {
  const rows = await sql`select * from content_blocks where slug = ${slug} and status = 'published' limit 1`;
  return rows[0] ? normalize(rows[0] as Record<string, unknown>) : null;
}

export async function createBlock(input: { title: string; slug: string; bodyHtml: string; status: "draft" | "published" }, createdBy: number) {
  validateInput(input);
  try {
    const rows = await sql`
      insert into content_blocks (title, slug, body_html, status, created_by)
      values (${input.title.trim()}, ${input.slug}, ${sanitizeRichHtml(input.bodyHtml)}, ${input.status}, ${createdBy})
      returning id
    `;
    return getBlockById(Number(rows[0].id));
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new AppValidationError(`Slug "${input.slug}" is already in use.`);
    throw error;
  }
}

export async function updateBlock(id: number, input: { title: string; slug: string; bodyHtml: string; status: "draft" | "published" }) {
  validateInput(input);
  try {
    await sql`
      update content_blocks
      set title = ${input.title.trim()}, slug = ${input.slug}, body_html = ${sanitizeRichHtml(input.bodyHtml)}, status = ${input.status}, updated_at = now()
      where id = ${id}
    `;
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new AppValidationError(`Slug "${input.slug}" is already in use.`);
    throw error;
  }
  return getBlockById(id);
}

export async function deleteBlock(id: number) {
  await sql`delete from content_blocks where id = ${id}`;
}

export async function expandPublishedBlocks(bodyHtml: string) {
  const matches = [...bodyHtml.matchAll(/\[\[block:([a-z0-9-]+)\]\]/g)];
  if (matches.length === 0) return bodyHtml;
  const replacements = new Map<string, string>();
  for (const match of matches) {
    const slug = match[1];
    if (replacements.has(slug)) continue;
    const block = await getPublishedBlockBySlug(slug);
    replacements.set(slug, block ? block.bodyHtml : `<span class="hybrid-static-cms-missing-block">${escapeHtml(`Missing block: ${slug}`)}</span>`);
  }
  return bodyHtml.replace(/\[\[block:([a-z0-9-]+)\]\]/g, (_, slug: string) => replacements.get(slug) ?? "");
}
