import path from "node:path";
import { mkdir, unlink } from "node:fs/promises";
import { config } from "./config";
import { slugify } from "./content";
import { sql } from "./db";

export type MediaRecord = {
  id: number;
  originalName: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  altText: string | null;
  publicUrl: string;
  uploadedAt: string;
  uploaderName: string | null;
};

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
  "video/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "application/pdf",
  "text/plain",
]);

export function isImageMedia(mimeType: string) {
  return mimeType.startsWith("image/");
}

export function isVideoMedia(mimeType: string) {
  return mimeType.startsWith("video/");
}

export function isAudioMedia(mimeType: string) {
  return mimeType.startsWith("audio/");
}

export function isPdfMedia(mimeType: string) {
  return mimeType === "application/pdf";
}

export function mediaEmbedSnippet(media: MediaRecord) {
  const alt = media.altText ?? media.originalName;

  if (isImageMedia(media.mimeType)) {
    return `<img src="${media.publicUrl}" alt="${alt}" />`;
  }

  if (isVideoMedia(media.mimeType)) {
    return `<video controls src="${media.publicUrl}"></video>`;
  }

  if (isAudioMedia(media.mimeType)) {
    return `<audio controls src="${media.publicUrl}"></audio>`;
  }

  if (isPdfMedia(media.mimeType)) {
    return `<a href="${media.publicUrl}" target="_blank" rel="noopener noreferrer">${media.originalName}</a>`;
  }

  return media.publicUrl;
}

function normalizeMedia(row: Record<string, unknown>): MediaRecord {
  return {
    id: Number(row.id),
    originalName: String(row.original_name),
    storedName: String(row.stored_name),
    mimeType: String(row.mime_type),
    sizeBytes: Number(row.size_bytes),
    altText: (row.alt_text as string | null) ?? null,
    publicUrl: String(row.public_url),
    uploadedAt: String(row.created_at),
    uploaderName: (row.uploader_name as string | null) ?? null,
  };
}

function extensionFor(fileName: string) {
  const ext = path.extname(fileName).toLowerCase();
  return ext || "";
}

function safeStoredName(fileName: string) {
  const ext = extensionFor(fileName);
  const stem = path.basename(fileName, ext);
  const base = slugify(stem) || "upload";
  return `${Date.now()}-${crypto.randomUUID()}-${base}${ext}`;
}

export async function listMedia() {
  const rows = await sql`
    select
      m.id,
      m.original_name,
      m.stored_name,
      m.mime_type,
      m.size_bytes,
      m.alt_text,
      m.public_url,
      m.created_at,
      u.display_name as uploader_name
    from media_files m
    left join users u on u.id = m.uploaded_by
    order by m.created_at desc, m.id desc
  `;

  return rows.map((row) => normalizeMedia(row as Record<string, unknown>));
}

export async function getMediaById(id: number) {
  const rows = await sql`
    select
      m.id,
      m.original_name,
      m.stored_name,
      m.mime_type,
      m.size_bytes,
      m.alt_text,
      m.public_url,
      m.created_at,
      u.display_name as uploader_name
    from media_files m
    left join users u on u.id = m.uploaded_by
    where m.id = ${id}
    limit 1
  `;

  return rows[0] ? normalizeMedia(rows[0] as Record<string, unknown>) : null;
}

export async function uploadMedia(file: File, altText: string, userId: number) {
  if (!file.name) {
    throw new Error("A file name is required.");
  }
  if (!allowedMimeTypes.has(file.type)) {
    throw new Error(`Unsupported file type: ${file.type || "unknown"}`);
  }

  await mkdir(config.cmsUploadDir, { recursive: true });

  const storedName = safeStoredName(file.name);
  const destination = path.join(config.cmsUploadDir, storedName);
  await Bun.write(destination, file);

  const publicUrl = `/cms/uploads/${storedName}`;
  const rows = await sql`
    insert into media_files (
      original_name,
      stored_name,
      mime_type,
      size_bytes,
      alt_text,
      uploaded_by,
      public_url
    ) values (
      ${file.name},
      ${storedName},
      ${file.type},
      ${file.size},
      ${altText || null},
      ${userId},
      ${publicUrl}
    )
    returning id
  `;

  return getMediaById(Number(rows[0].id));
}

export async function deleteMedia(id: number) {
  const media = await getMediaById(id);
  if (!media) {
    return;
  }

  await sql`delete from media_files where id = ${id}`;

  try {
    await unlink(path.join(config.cmsUploadDir, media.storedName));
  } catch {
    // Ignore missing files so metadata cleanup still succeeds.
  }
}
