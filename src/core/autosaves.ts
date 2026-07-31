import { sql } from "./db";
import { AppValidationError } from "./validation";

export type AutosaveContentType = "post" | "page";
export type AutosavePayload = Record<string, string | boolean>;

const commonFields = new Set([
  "title", "slug", "excerpt", "bodyMd", "bodyHtml", "status", "publishedAt",
  "seoTitle", "seoDescription", "seoCanonicalUrl", "seoOgImage", "seoKeywords",
  "seoNoindex", "seoNofollow",
]);
const fieldsByType: Record<AutosaveContentType, Set<string>> = {
  post: new Set([...commonFields, "categories", "tags", "seriesId"]),
  page: new Set([...commonFields, "pageGroupId", "stylesheetPath"]),
};

function validateDraftKey(draftKey: string) {
  if (!/^[A-Za-z0-9_-]{1,96}$/.test(draftKey)) {
    throw new AppValidationError("Autosave key is invalid.");
  }
}

function sanitizePayload(contentType: AutosaveContentType, payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new AppValidationError("Autosave data is invalid.");
  }
  const sanitized: AutosavePayload = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!fieldsByType[contentType].has(key)) continue;
    if (typeof value === "boolean") {
      sanitized[key] = value;
      continue;
    }
    if (typeof value === "string") sanitized[key] = value.slice(0, 1_000_000);
  }
  if (JSON.stringify(sanitized).length > 2_000_000) {
    throw new AppValidationError("Autosave data is too large.");
  }
  return sanitized;
}

function normalizeBaseUpdatedAt(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AppValidationError("Autosave base timestamp is invalid.");
  return date.toISOString();
}

function isoTimestamp(value: unknown) {
  return new Date(value instanceof Date ? value.getTime() : String(value)).toISOString();
}

export async function getEditorAutosave(userId: number, contentType: AutosaveContentType, draftKey: string) {
  validateDraftKey(draftKey);
  const rows = await sql`
    select payload, base_updated_at, updated_at
    from editor_autosaves
    where user_id = ${userId}
      and content_type = ${contentType}
      and draft_key = ${draftKey}
    limit 1
  `;
  if (!rows[0]) return null;
  return {
    payload: rows[0].payload as AutosavePayload,
    baseUpdatedAt: rows[0].base_updated_at ? isoTimestamp(rows[0].base_updated_at) : null,
    updatedAt: isoTimestamp(rows[0].updated_at),
  };
}

export async function saveEditorAutosave(
  userId: number,
  contentType: AutosaveContentType,
  draftKey: string,
  payload: unknown,
  baseUpdatedAt?: unknown,
) {
  validateDraftKey(draftKey);
  const sanitized = sanitizePayload(contentType, payload);
  const normalizedBaseUpdatedAt = normalizeBaseUpdatedAt(baseUpdatedAt);
  const rows = await sql`
    insert into editor_autosaves (user_id, content_type, draft_key, payload, base_updated_at)
    values (${userId}, ${contentType}, ${draftKey}, ${sql.json(sanitized)}, ${normalizedBaseUpdatedAt})
    on conflict (user_id, content_type, draft_key) do update set
      payload = excluded.payload,
      base_updated_at = excluded.base_updated_at,
      updated_at = now()
    returning updated_at
  `;
  return isoTimestamp(rows[0].updated_at);
}

export async function deleteEditorAutosave(userId: number, contentType: AutosaveContentType, draftKey: string) {
  validateDraftKey(draftKey);
  await sql`
    delete from editor_autosaves
    where user_id = ${userId}
      and content_type = ${contentType}
      and draft_key = ${draftKey}
  `;
}

export async function deleteExpiredEditorAutosaves() {
  const result = await sql`delete from editor_autosaves where updated_at < now() - interval '30 days'`;
  return result.count;
}
