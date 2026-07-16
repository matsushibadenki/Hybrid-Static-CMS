import { sql } from "./db";
import { AppValidationError, isUniqueConstraintError, requireNonEmpty, validateSlug } from "./validation";

export type PageGroupRecord = { id: number; title: string; slug: string; description: string | null; pageCount: number; createdAt: string; updatedAt: string };

function normalize(row: Record<string, unknown>): PageGroupRecord {
  return { id: Number(row.id), title: String(row.title), slug: String(row.slug), description: (row.description as string | null) ?? null, pageCount: Number(row.page_count ?? 0), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}

export async function listPageGroups() {
  const rows = await sql`select g.*, count(m.page_id)::int as page_count from page_groups g left join page_group_members m on m.group_id = g.id group by g.id order by g.updated_at desc, g.id desc`;
  return rows.map((row) => normalize(row as Record<string, unknown>));
}

export async function getPageGroupById(id: number) {
  const rows = await sql`select g.*, count(m.page_id)::int as page_count from page_groups g left join page_group_members m on m.group_id = g.id where g.id = ${id} group by g.id limit 1`;
  return rows[0] ? normalize(rows[0] as Record<string, unknown>) : null;
}

export async function createPageGroup(input: { title: string; slug: string; description?: string }) {
  requireNonEmpty(input.title, "Page group title"); validateSlug(input.slug);
  try {
    const rows = await sql`insert into page_groups (title, slug, description) values (${input.title}, ${input.slug}, ${input.description ?? null}) returning id`;
    return getPageGroupById(Number(rows[0].id));
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new AppValidationError(`Slug "${input.slug}" is already in use.`);
    throw error;
  }
}

export async function updatePageGroup(id: number, input: { title: string; slug: string; description?: string }) {
  requireNonEmpty(input.title, "Page group title"); validateSlug(input.slug);
  try { await sql`update page_groups set title = ${input.title}, slug = ${input.slug}, description = ${input.description ?? null}, updated_at = now() where id = ${id}`; }
  catch (error) { if (isUniqueConstraintError(error)) throw new AppValidationError(`Slug "${input.slug}" is already in use.`); throw error; }
  return getPageGroupById(id);
}

export async function deletePageGroup(id: number) { await sql`delete from page_groups where id = ${id}`; }
export async function listPageGroupMembers(groupId: number) { return sql`select p.id, p.title, p.slug, p.status, m.position from page_group_members m join pages p on p.id = m.page_id where m.group_id = ${groupId} order by m.position asc, p.id asc`; }
export async function getPageGroupId(pageId: number) {
  const rows = await sql`select group_id from page_group_members where page_id = ${pageId} limit 1`;
  return rows[0] ? Number(rows[0].group_id) : null;
}
export async function assignPageToGroup(groupId: number, pageId: number, position: number) { await sql`insert into page_group_members (page_id, group_id, position) values (${pageId}, ${groupId}, ${Math.max(0, position)}) on conflict (page_id) do update set group_id = excluded.group_id, position = excluded.position`; await sql`update page_groups set updated_at = now() where id = ${groupId}`; }
export async function removePageFromGroup(pageId: number) { await sql`delete from page_group_members where page_id = ${pageId}`; }
