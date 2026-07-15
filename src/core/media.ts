import path from "node:path";
import { mkdir, unlink } from "node:fs/promises";
import sanitizeHtml from "sanitize-html";
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

function isAllowedMimeType(mimeType: string) {
  return allowedMimeTypes.has(mimeType) || (mimeType === "image/svg+xml" && config.allowSvgUploads);
}

export function sanitizeSvgContent(value: string) {
  const sanitized = sanitizeHtml(value, {
    allowedTags: [
      "svg", "title", "desc", "g", "path", "circle", "ellipse", "line", "polyline", "polygon", "rect",
      "defs", "linearGradient", "radialGradient", "stop", "clipPath", "mask", "pattern", "symbol", "use",
    ],
    allowedAttributes: {
      svg: ["xmlns", "viewBox", "width", "height", "fill", "stroke", "stroke-width", "role", "aria-labelledby"],
      title: [],
      desc: [],
      g: ["id", "fill", "stroke", "stroke-width", "transform", "opacity", "clip-path", "mask"],
      path: ["d", "fill", "stroke", "stroke-width", "transform", "opacity", "clip-path", "mask"],
      circle: ["cx", "cy", "r", "fill", "stroke", "stroke-width", "transform", "opacity"],
      ellipse: ["cx", "cy", "rx", "ry", "fill", "stroke", "stroke-width", "transform", "opacity"],
      line: ["x1", "x2", "y1", "y2", "fill", "stroke", "stroke-width", "transform", "opacity"],
      polyline: ["points", "fill", "stroke", "stroke-width", "transform", "opacity"],
      polygon: ["points", "fill", "stroke", "stroke-width", "transform", "opacity"],
      rect: ["x", "y", "width", "height", "rx", "ry", "fill", "stroke", "stroke-width", "transform", "opacity"],
      defs: [],
      linearGradient: ["id", "x1", "x2", "y1", "y2"],
      radialGradient: ["id", "cx", "cy", "r", "fx", "fy"],
      stop: ["offset", "stop-color", "stop-opacity"],
      clipPath: ["id", "clipPathUnits"],
      mask: ["id", "maskUnits", "maskContentUnits"],
      pattern: ["id", "x", "y", "width", "height", "patternUnits"],
      symbol: ["id", "viewBox"],
      use: ["id", "x", "y", "width", "height", "transform"],
    },
    allowedSchemes: [],
  });

  if (!/<svg(?:\s|>)/i.test(sanitized)) {
    throw new Error("The SVG file does not contain a valid SVG root element.");
  }
  return sanitized;
}

function startsWithBytes(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function containsAscii(bytes: Uint8Array, value: string) {
  const text = new TextDecoder().decode(bytes);
  return text.includes(value);
}

async function validateFileContent(file: File) {
  if (file.type === "text/plain" || file.type === "image/svg+xml") return;

  const header = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const valid =
    (file.type === "image/jpeg" && startsWithBytes(header, [0xff, 0xd8, 0xff])) ||
    (file.type === "image/png" && startsWithBytes(header, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
    (file.type === "image/gif" && (containsAscii(header, "GIF87a") || containsAscii(header, "GIF89a"))) ||
    (file.type === "image/webp" && startsWithBytes(header, [0x52, 0x49, 0x46, 0x46]) && containsAscii(header, "WEBP")) ||
    (file.type === "application/pdf" && containsAscii(header, "%PDF-")) ||
    ((file.type === "video/mp4" || file.type === "audio/mp4") && containsAscii(header, "ftyp")) ||
    ((file.type === "video/webm" || file.type === "audio/webm") && startsWithBytes(header, [0x1a, 0x45, 0xdf, 0xa3])) ||
    (file.type === "video/ogg" && containsAscii(header, "OggS")) ||
    (file.type === "audio/ogg" && containsAscii(header, "OggS")) ||
    (file.type === "audio/wav" && startsWithBytes(header, [0x52, 0x49, 0x46, 0x46]) && containsAscii(header, "WAVE")) ||
    (file.type === "audio/mpeg" && (containsAscii(header, "ID3") || startsWithBytes(header, [0xff, 0xfb]) || startsWithBytes(header, [0xff, 0xf3])));

  if (!valid) {
    throw new Error("The file content does not match its declared media type.");
  }
}

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
  if (file.size <= 0) {
    throw new Error("The uploaded file is empty.");
  }
  if (file.size > config.maxUploadBytes) {
    throw new Error(`The uploaded file exceeds the ${Math.ceil(config.maxUploadBytes / 1024 / 1024)} MB limit.`);
  }
  if (!isAllowedMimeType(file.type)) {
    throw new Error(`Unsupported file type: ${file.type || "unknown"}`);
  }
  await validateFileContent(file);

  const content = file.type === "image/svg+xml" ? new Blob([sanitizeSvgContent(await file.text())], { type: file.type }) : file;

  await mkdir(config.cmsUploadDir, { recursive: true });

  const storedName = safeStoredName(file.name);
  const destination = path.join(config.cmsUploadDir, storedName);
  await Bun.write(destination, content);

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
      ${content.size},
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
