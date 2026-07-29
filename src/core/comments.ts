import { bigintArray, sql } from "./db";
import { AppValidationError } from "./validation";

export type CommentStatus = "pending" | "approved";

export type PostCommentRecord = {
  id: number;
  postId: number;
  postTitle: string;
  authorName: string;
  authorEmail: string;
  body: string;
  status: CommentStatus;
  createdAt: string;
  approvedAt: string | null;
};

function normalizeComment(row: Record<string, unknown>): PostCommentRecord {
  return {
    id: Number(row.id),
    postId: Number(row.post_id),
    postTitle: String(row.post_title ?? ""),
    authorName: String(row.author_name),
    authorEmail: String(row.author_email),
    body: String(row.body),
    status: row.status as CommentStatus,
    createdAt: String(row.created_at),
    approvedAt: row.approved_at ? String(row.approved_at) : null,
  };
}

export function validateCommentInput(input: { authorName: string; authorEmail: string; body: string }) {
  const authorName = input.authorName.trim();
  const authorEmail = input.authorEmail.trim().toLowerCase();
  const body = input.body.trim();
  if (!authorName || authorName.length > 80) throw new AppValidationError("Name must be between 1 and 80 characters.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authorEmail) || authorEmail.length > 254) throw new AppValidationError("Enter a valid email address.");
  if (!body || body.length > 4000) throw new AppValidationError("Comment must be between 1 and 4000 characters.");
  return { authorName, authorEmail, body };
}

export async function createPendingComment(postId: number, input: { authorName: string; authorEmail: string; body: string }) {
  const value = validateCommentInput(input);
  const rows = await sql`
    insert into post_comments (post_id, author_name, author_email, body)
    select id, ${value.authorName}, ${value.authorEmail}, ${value.body}
    from posts where id = ${postId} and status = 'published'
    returning id
  `;
  if (!rows[0]) throw new AppValidationError("Comments are not available for this article.");
  return Number(rows[0].id);
}

export async function listComments(status: CommentStatus | "any" = "any") {
  const rows = status === "any"
    ? await sql`select pc.*, p.title as post_title from post_comments pc join posts p on p.id = pc.post_id order by pc.created_at desc, pc.id desc limit 500`
    : await sql`select pc.*, p.title as post_title from post_comments pc join posts p on p.id = pc.post_id where pc.status = ${status} order by pc.created_at desc, pc.id desc limit 500`;
  return rows.map((row) => normalizeComment(row as Record<string, unknown>));
}

export async function listApprovedCommentsForPosts(postIds: number[]) {
  const result = new Map<number, PostCommentRecord[]>();
  if (postIds.length === 0) return result;
  const rows = await sql`
    select pc.*, p.title as post_title
    from post_comments pc join posts p on p.id = pc.post_id
    where pc.status = 'approved' and pc.post_id = any(${bigintArray(postIds)})
    order by pc.post_id, pc.created_at, pc.id
  `;
  for (const row of rows) {
    const comment = normalizeComment(row as Record<string, unknown>);
    const comments = result.get(comment.postId) ?? [];
    comments.push(comment);
    result.set(comment.postId, comments);
  }
  return result;
}

export async function approveComment(id: number, actorUserId: number) {
  await sql`update post_comments set status = 'approved', approved_by = ${actorUserId}, approved_at = now(), updated_at = now() where id = ${id}`;
}

export async function deleteComment(id: number) {
  await sql`delete from post_comments where id = ${id}`;
}
