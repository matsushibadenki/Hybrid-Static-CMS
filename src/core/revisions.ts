import { sql } from "./db";
import type { PageRecord, PostRecord } from "./types";

export type RevisionContentType = "post" | "page";

export type ContentRevision = {
  id: number;
  contentType: RevisionContentType;
  contentId: number;
  snapshot: PostRecord | PageRecord;
  createdBy: number | null;
  creatorName: string | null;
  createdAt: string;
};

function normalizeRevision(row: Record<string, unknown>): ContentRevision {
  return {
    id: Number(row.id),
    contentType: row.content_type as RevisionContentType,
    contentId: Number(row.content_id),
    snapshot: row.snapshot_json as PostRecord | PageRecord,
    createdBy: row.created_by ? Number(row.created_by) : null,
    creatorName: (row.creator_name as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

export async function createContentRevision(
  contentType: RevisionContentType,
  contentId: number,
  snapshot: PostRecord | PageRecord,
  createdBy: number | null,
) {
  await sql`
    insert into content_revisions (content_type, content_id, snapshot_json, created_by)
    values (${contentType}, ${contentId}, ${sql.json(snapshot)}, ${createdBy})
  `;
}

export async function listContentRevisions(contentType: RevisionContentType, contentId: number) {
  const rows = await sql`
    select r.*, u.display_name as creator_name
    from content_revisions r
    left join users u on u.id = r.created_by
    where r.content_type = ${contentType} and r.content_id = ${contentId}
    order by r.created_at desc, r.id desc
    limit 100
  `;
  return rows.map((row) => normalizeRevision(row as Record<string, unknown>));
}

export async function getContentRevision(id: number) {
  const rows = await sql`
    select r.*, u.display_name as creator_name
    from content_revisions r
    left join users u on u.id = r.created_by
    where r.id = ${id}
    limit 1
  `;
  return rows[0] ? normalizeRevision(rows[0] as Record<string, unknown>) : null;
}
