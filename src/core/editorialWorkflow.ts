import { sql, withTransaction } from "./db";
import { assertEditorialFingerprintPublishAllowed, pageEditorialFingerprint, postEditorialFingerprint } from "./editorialFingerprint";
import { createOperatorNotification } from "./notifications";
import { getPageById } from "./pages";
import { getPostById } from "./posts";
import type { EditorialWorkflowState, PageInput, PageRecord, PostInput, PostRecord } from "./types";
import { AppValidationError } from "./validation";

export type EditorialContentType = "post" | "page";
export type EditorialWorkflowAction = "submit" | "approve" | "request_changes" | "withdraw";

export type EditorialWorkflowEvent = {
  id: number;
  action: EditorialWorkflowAction;
  fromState: EditorialWorkflowState;
  toState: EditorialWorkflowState;
  note: string | null;
  actorName: string | null;
  createdAt: string;
};

async function getContent(contentType: EditorialContentType, contentId: number) {
  return contentType === "post" ? getPostById(contentId) : getPageById(contentId);
}

function contentFingerprint(content: PostRecord | PageRecord) {
  return "categories" in content ? postEditorialFingerprint(content) : pageEditorialFingerprint(content);
}

function cleanNote(value: string, required = false) {
  const note = value.trim().slice(0, 2000);
  if (required && !note) throw new AppValidationError("Explain the requested changes.");
  return note || null;
}

async function updateState(
  trx: typeof sql,
  contentType: EditorialContentType,
  contentId: number,
  values: {
    state: EditorialWorkflowState;
    hash: string | null;
    note: string | null;
    actorUserId: number;
    requested: boolean;
    reviewed: boolean;
  },
) {
  const query = contentType === "post"
    ? trx`update posts set
        workflow_state = ${values.state}, workflow_content_hash = ${values.hash}, workflow_note = ${values.note},
        review_requested_at = ${values.requested ? new Date().toISOString() : null},
        review_requested_by = ${values.requested ? values.actorUserId : null},
        reviewed_at = ${values.reviewed ? new Date().toISOString() : null},
        reviewed_by = ${values.reviewed ? values.actorUserId : null}
      where id = ${contentId}`
    : trx`update pages set
        workflow_state = ${values.state}, workflow_content_hash = ${values.hash}, workflow_note = ${values.note},
        review_requested_at = ${values.requested ? new Date().toISOString() : null},
        review_requested_by = ${values.requested ? values.actorUserId : null},
        reviewed_at = ${values.reviewed ? new Date().toISOString() : null},
        reviewed_by = ${values.reviewed ? values.actorUserId : null}
      where id = ${contentId}`;
  await query;
}

async function recordEvent(
  trx: typeof sql,
  input: {
    contentType: EditorialContentType;
    contentId: number;
    action: EditorialWorkflowAction;
    fromState: EditorialWorkflowState;
    toState: EditorialWorkflowState;
    note: string | null;
    actorUserId: number;
  },
) {
  await trx`
    insert into editorial_workflow_events (
      content_type, content_id, action, from_state, to_state, note, actor_user_id
    ) values (
      ${input.contentType}, ${input.contentId}, ${input.action}, ${input.fromState}, ${input.toState}, ${input.note}, ${input.actorUserId}
    )
  `;
}

export async function submitContentForReview(
  contentType: EditorialContentType,
  contentId: number,
  actorUserId: number,
  note = "",
) {
  const content = await getContent(contentType, contentId);
  if (!content) throw new AppValidationError("Content not found.");
  if (content.workflowState === "in_review") throw new AppValidationError("Content is already in review.");
  const cleanedNote = cleanNote(note);
  const hash = contentFingerprint(content);
  await withTransaction(async (trx) => {
    await updateState(trx, contentType, contentId, {
      state: "in_review", hash, note: cleanedNote, actorUserId, requested: true, reviewed: false,
    });
    await recordEvent(trx, {
      contentType, contentId, action: "submit", fromState: content.workflowState, toState: "in_review", note: cleanedNote, actorUserId,
    });
  });
  await createOperatorNotification({
    level: "info",
    action: `editorial.${contentType}.review_requested`,
    message: `${contentType === "post" ? "Post" : "Page"} “${content.title}” is ready for editorial review.`,
  }).catch(() => undefined);
}

export async function approveContentReview(contentType: EditorialContentType, contentId: number, actorUserId: number, note = "") {
  const content = await getContent(contentType, contentId);
  if (!content) throw new AppValidationError("Content not found.");
  if (content.workflowState !== "in_review") throw new AppValidationError("Only content in review can be approved.");
  const hash = contentFingerprint(content);
  if (!content.workflowContentHash || content.workflowContentHash !== hash) {
    throw new AppValidationError("Content changed after review was requested. Submit it for review again.");
  }
  const cleanedNote = cleanNote(note);
  await withTransaction(async (trx) => {
    await updateState(trx, contentType, contentId, {
      state: "approved", hash, note: cleanedNote, actorUserId, requested: false, reviewed: true,
    });
    await recordEvent(trx, {
      contentType, contentId, action: "approve", fromState: "in_review", toState: "approved", note: cleanedNote, actorUserId,
    });
  });
}

export async function requestContentChanges(contentType: EditorialContentType, contentId: number, actorUserId: number, note: string) {
  const content = await getContent(contentType, contentId);
  if (!content) throw new AppValidationError("Content not found.");
  if (content.workflowState !== "in_review") throw new AppValidationError("Only content in review can be returned for changes.");
  const cleanedNote = cleanNote(note, true);
  await withTransaction(async (trx) => {
    await updateState(trx, contentType, contentId, {
      state: "changes_requested", hash: null, note: cleanedNote, actorUserId, requested: false, reviewed: true,
    });
    await recordEvent(trx, {
      contentType, contentId, action: "request_changes", fromState: "in_review", toState: "changes_requested", note: cleanedNote, actorUserId,
    });
  });
}

export async function withdrawContentReview(contentType: EditorialContentType, contentId: number, actorUserId: number) {
  const content = await getContent(contentType, contentId);
  if (!content) throw new AppValidationError("Content not found.");
  if (content.workflowState !== "in_review") throw new AppValidationError("Only content in review can be withdrawn.");
  await withTransaction(async (trx) => {
    await updateState(trx, contentType, contentId, {
      state: "draft", hash: null, note: null, actorUserId, requested: false, reviewed: false,
    });
    await recordEvent(trx, {
      contentType, contentId, action: "withdraw", fromState: "in_review", toState: "draft", note: null, actorUserId,
    });
  });
}

export async function listEditorialWorkflowEvents(contentType: EditorialContentType, contentId: number, limit = 12) {
  const rows = await sql`
    select e.id, e.action, e.from_state, e.to_state, e.note, e.created_at, u.display_name as actor_name
    from editorial_workflow_events e
    left join users u on u.id = e.actor_user_id
    where e.content_type = ${contentType} and e.content_id = ${contentId}
    order by e.created_at desc, e.id desc
    limit ${Math.max(1, Math.min(50, limit))}
  `;
  return rows.map((row): EditorialWorkflowEvent => ({
    id: Number(row.id), action: row.action as EditorialWorkflowAction,
    fromState: row.from_state as EditorialWorkflowState, toState: row.to_state as EditorialWorkflowState,
    note: row.note ? String(row.note) : null, actorName: row.actor_name ? String(row.actor_name) : null,
    createdAt: String(row.created_at),
  }));
}

export function assertPostEditorialPublishAllowed(content: PostRecord, input: PostInput) {
  assertEditorialPublishAllowed(content.workflowState, content.workflowContentHash, postEditorialFingerprint(input));
}

export function assertPageEditorialPublishAllowed(content: PageRecord, input: PageInput) {
  assertEditorialPublishAllowed(content.workflowState, content.workflowContentHash, pageEditorialFingerprint(input));
}

function assertEditorialPublishAllowed(state: EditorialWorkflowState, approvedHash: string | null, incomingHash: string) {
  assertEditorialFingerprintPublishAllowed(state, approvedHash, incomingHash);
}
