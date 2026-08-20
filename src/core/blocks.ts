import { sanitizeRichHtml, escapeHtml } from "./content";
import { sql } from "./db";
import { AppValidationError, isUniqueConstraintError, requireNonEmpty, validateSlug } from "./validation";

export const contentBlockLayoutIds = ["plain", "feature", "split", "grid", "notice"] as const;
export type ContentBlockLayout = (typeof contentBlockLayoutIds)[number];

export const contentBlockLayouts: readonly { id: ContentBlockLayout; name: string; description: string }[] = [
  { id: "plain", name: "Plain", description: "Keep the content in the surrounding article flow." },
  { id: "feature", name: "Feature", description: "Give one message more space and visual emphasis." },
  { id: "split", name: "Split", description: "Arrange direct child elements in two responsive columns." },
  { id: "grid", name: "Grid", description: "Arrange direct child elements as responsive cards." },
  { id: "notice", name: "Notice", description: "Set supporting or important information apart." },
];

export function isContentBlockLayout(value: unknown): value is ContentBlockLayout {
  return contentBlockLayoutIds.includes(value as ContentBlockLayout);
}

export type ContentBlock = {
  id: number;
  title: string;
  slug: string;
  bodyHtml: string;
  layoutType: ContentBlockLayout;
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
    layoutType: isContentBlockLayout(row.layout_type) ? row.layout_type : "plain",
    status: row.status as ContentBlock["status"],
    createdBy: row.created_by ? Number(row.created_by) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

type ContentBlockInput = { title: string; slug: string; bodyHtml: string; status: "draft" | "published"; layoutType?: ContentBlockLayout };

function validateInput(input: ContentBlockInput) {
  requireNonEmpty(input.title, "Title");
  validateSlug(input.slug);
  requireNonEmpty(input.bodyHtml, "Body HTML");
  if (input.layoutType !== undefined && !isContentBlockLayout(input.layoutType)) throw new AppValidationError("Select a valid block layout.");
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

export async function createBlock(input: ContentBlockInput, createdBy: number) {
  validateInput(input);
  const layoutType = input.layoutType ?? "plain";
  try {
    const rows = await sql`
      insert into content_blocks (title, slug, body_html, layout_type, status, created_by)
      values (${input.title.trim()}, ${input.slug}, ${sanitizeRichHtml(input.bodyHtml)}, ${layoutType}, ${input.status}, ${createdBy})
      returning id
    `;
    return getBlockById(Number(rows[0].id));
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new AppValidationError(`Slug "${input.slug}" is already in use.`);
    throw error;
  }
}

export async function updateBlock(id: number, input: ContentBlockInput) {
  validateInput(input);
  const layoutType = input.layoutType ?? "plain";
  try {
    await sql`
      update content_blocks
      set title = ${input.title.trim()}, slug = ${input.slug}, body_html = ${sanitizeRichHtml(input.bodyHtml)}, layout_type = ${layoutType}, status = ${input.status}, updated_at = now()
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

export function renderContentBlock(layoutType: ContentBlockLayout, bodyHtml: string) {
  const layout = isContentBlockLayout(layoutType) ? layoutType : "plain";
  if (layout === "plain") return bodyHtml;
  return `<section class="hsc-layout-block hsc-layout-block--${layout}" data-layout="${layout}">${bodyHtml}</section>`;
}

export async function expandPublishedBlocks(bodyHtml: string) {
  const matches = [...bodyHtml.matchAll(/\[\[block:([a-z0-9-]+)\]\]/g)];
  if (matches.length === 0) return bodyHtml;
  const replacements = new Map<string, string>();
  for (const match of matches) {
    const slug = match[1];
    if (replacements.has(slug)) continue;
    const block = await getPublishedBlockBySlug(slug);
    replacements.set(slug, block ? renderContentBlock(block.layoutType, block.bodyHtml) : `<span class="hybrid-static-cms-missing-block">${escapeHtml(`Missing block: ${slug}`)}</span>`);
  }
  return bodyHtml.replace(/\[\[block:([a-z0-9-]+)\]\]/g, (_, slug: string) => replacements.get(slug) ?? "");
}
