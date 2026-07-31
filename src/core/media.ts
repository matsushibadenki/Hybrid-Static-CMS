import path from "node:path";
import { mkdir, readdir, readFile, stat, unlink } from "node:fs/promises";
import sanitizeHtml from "sanitize-html";
import { config } from "./config";
import { escapeHtml, slugify } from "./content";
import { sql } from "./db";
import { processImageUpload, type ImageVariantFormat, type ImageVariantKind } from "./imageProcessing";
import type { UserRole } from "./types";
import { AppValidationError } from "./validation";

export type MediaVariantRecord = {
  id: number;
  kind: ImageVariantKind;
  format: ImageVariantFormat;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  storedName: string;
  publicUrl: string;
};

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
  width: number | null;
  height: number | null;
  metadata: Record<string, unknown>;
  variants: MediaVariantRecord[];
};

export type MediaReference = {
  sourceType: "post" | "page" | "block" | "menu" | "form" | "revision" | "public_file";
  sourceId: string;
  title: string;
  field: string;
};

export type MediaReferenceSource = MediaReference & {
  value: string;
};

export type MediaUsageRecord = MediaRecord & {
  references: MediaReference[];
};

export type MediaUploadPolicySettings = {
  globalMaxUploadBytes: number;
  siteQuotaBytes: number;
  userQuotaBytes: number;
  allowedRoles: ReadonlySet<UserRole>;
  roleQuotaBytes: Partial<Record<UserRole, number>>;
  roleMaxUploadBytes: Partial<Record<UserRole, number>>;
};

export type MediaStorageUsage = {
  siteUsedBytes: number;
  siteQuotaBytes: number;
  userUsedBytes: number;
  userQuotaBytes: number;
  maxUploadBytes: number;
  uploadAllowed: boolean;
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

const storedExtensions: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/ogg": ".ogv",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "audio/ogg": ".ogg",
  "audio/wav": ".wav",
  "audio/webm": ".webm",
  "application/pdf": ".pdf",
  "text/plain": ".txt",
};

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
    throw new AppValidationError("The SVG file does not contain a valid SVG root element.");
  }
  return sanitized;
}

function startsWithBytes(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function hasBytesAt(bytes: Uint8Array, offset: number, signature: number[]) {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((value, index) => bytes[offset + index] === value);
}

function containsAscii(bytes: Uint8Array, value: string) {
  const text = new TextDecoder().decode(bytes);
  return text.includes(value);
}

function endsWithByte(bytes: Uint8Array, value: number) {
  return bytes.length > 0 && bytes[bytes.length - 1] === value;
}

function endsWithBytes(bytes: Uint8Array, signature: number[]) {
  if (bytes.length < signature.length) return false;
  const start = bytes.length - signature.length;
  return signature.every((value, offset) => bytes[start + offset] === value);
}

function uint32LittleEndian(bytes: Uint8Array, offset: number) {
  if (bytes.length < offset + 4) return null;
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function normalizedPdfNames(value: string) {
  return value.replace(/#([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
}

export async function validateMediaFileContent(file: File) {
  if (file.type === "text/plain" || file.type === "image/svg+xml") return;

  const header = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const tail = new Uint8Array(await file.slice(Math.max(0, file.size - 4096)).arrayBuffer());
  const valid =
    (file.type === "image/jpeg" && startsWithBytes(header, [0xff, 0xd8, 0xff]) && endsWithBytes(tail, [0xff, 0xd9])) ||
    (file.type === "image/png" && startsWithBytes(header, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) && endsWithBytes(tail.slice(0, -4), [0x49, 0x45, 0x4e, 0x44])) ||
    (file.type === "image/gif" && (containsAscii(header, "GIF87a") || containsAscii(header, "GIF89a")) && endsWithByte(tail, 0x3b)) ||
    (file.type === "image/webp" && startsWithBytes(header, [0x52, 0x49, 0x46, 0x46]) && hasBytesAt(header, 8, [0x57, 0x45, 0x42, 0x50]) && uint32LittleEndian(header, 4) === file.size - 8) ||
    (file.type === "application/pdf" && containsAscii(header, "%PDF-") && containsAscii(tail, "%%EOF")) ||
    ((file.type === "video/mp4" || file.type === "audio/mp4") && hasBytesAt(header, 4, [0x66, 0x74, 0x79, 0x70])) ||
    ((file.type === "video/webm" || file.type === "audio/webm") && startsWithBytes(header, [0x1a, 0x45, 0xdf, 0xa3])) ||
    ((file.type === "video/ogg" || file.type === "audio/ogg") && startsWithBytes(header, [0x4f, 0x67, 0x67, 0x53])) ||
    (file.type === "audio/wav" && startsWithBytes(header, [0x52, 0x49, 0x46, 0x46]) && hasBytesAt(header, 8, [0x57, 0x41, 0x56, 0x45])) ||
    (file.type === "audio/mpeg" && (startsWithBytes(header, [0x49, 0x44, 0x33]) || (header[0] === 0xff && [0xe2, 0xe3, 0xea, 0xeb, 0xf2, 0xf3, 0xfa, 0xfb].includes(header[1] ?? 0))));

  if (valid && file.type === "application/pdf") {
    const pdfText = normalizedPdfNames(await file.text());
    if (/\/(?:JavaScript|JS|Launch|EmbeddedFile|RichMedia|XFA)\b/i.test(pdfText)) {
      throw new AppValidationError("PDF files containing active content are not allowed.");
    }
  }

  if (!valid) {
    throw new AppValidationError("The media file is incomplete, malformed, or does not match its declared type.");
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
  const alt = escapeHtml(media.altText ?? media.originalName);
  const display = media.variants.find((variant) => variant.kind === "display");
  const webp = media.variants.find((variant) => variant.format === "webp" && variant.kind !== "thumbnail");
  const avif = media.variants.find((variant) => variant.format === "avif");
  const publicUrl = escapeHtml(display?.publicUrl ?? media.publicUrl);
  const originalName = escapeHtml(media.originalName);

  if (isImageMedia(media.mimeType)) {
    const width = display?.width ?? media.width;
    const height = display?.height ?? media.height;
    const dimensions = width && height ? ` width="${width}" height="${height}"` : "";
    const sources = [
      avif ? `<source srcset="${escapeHtml(avif.publicUrl)}" type="image/avif" />` : "",
      webp ? `<source srcset="${escapeHtml(webp.publicUrl)}" type="image/webp" />` : "",
    ].join("");
    const image = `<img src="${publicUrl}" alt="${alt}"${dimensions} loading="lazy" decoding="async" />`;
    return sources ? `<picture>${sources}${image}</picture>` : image;
  }

  if (isVideoMedia(media.mimeType)) {
    return `<video controls src="${publicUrl}"></video>`;
  }

  if (isAudioMedia(media.mimeType)) {
    return `<audio controls src="${publicUrl}"></audio>`;
  }

  if (isPdfMedia(media.mimeType)) {
    return `<a href="${publicUrl}" target="_blank" rel="noopener noreferrer">${originalName}</a>`;
  }

  return publicUrl;
}

export function mediaPreviewUrl(media: MediaRecord) {
  return media.variants.find((variant) => variant.kind === "thumbnail")?.publicUrl
    ?? media.variants.find((variant) => variant.kind === "display")?.publicUrl
    ?? media.publicUrl;
}

export function mediaTotalSizeBytes(media: MediaRecord) {
  return media.sizeBytes + media.variants.reduce((total, variant) => total + variant.sizeBytes, 0);
}

export function detectMediaReferences(media: MediaRecord, sources: readonly MediaReferenceSource[]) {
  const urls = [media.publicUrl, ...media.variants.map((variant) => variant.publicUrl)];
  const candidates = new Set(urls.flatMap((url) => [url, url.replace(/^\/+/, "")]).filter(Boolean));
  const references = new Map<string, MediaReference>();

  for (const source of sources) {
    if (![...candidates].some((candidate) => source.value.includes(candidate))) continue;
    const key = `${source.sourceType}:${source.sourceId}:${source.field}`;
    references.set(key, {
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      title: source.title,
      field: source.field,
    });
  }

  return [...references.values()];
}

function normalizeMedia(row: Record<string, unknown>): MediaRecord {
  const rawVariants = typeof row.variants === "string" ? JSON.parse(row.variants) : row.variants;
  const variants = Array.isArray(rawVariants)
    ? rawVariants.map((variant) => {
      const value = variant as Record<string, unknown>;
      return {
        id: Number(value.id),
        kind: String(value.kind) as ImageVariantKind,
        format: String(value.format) as ImageVariantFormat,
        mimeType: String(value.mimeType),
        width: Number(value.width),
        height: Number(value.height),
        sizeBytes: Number(value.sizeBytes),
        storedName: String(value.storedName),
        publicUrl: String(value.publicUrl),
      };
    })
    : [];
  const metadata = typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata;
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
    width: row.width === null || row.width === undefined ? null : Number(row.width),
    height: row.height === null || row.height === undefined ? null : Number(row.height),
    metadata: metadata && typeof metadata === "object" ? metadata as Record<string, unknown> : {},
    variants,
  };
}

export function storedExtensionForMimeType(mimeType: string) {
  return storedExtensions[mimeType] ?? ".bin";
}

export function safeMediaStoredName(fileName: string, mimeType: string) {
  const originalExtension = path.extname(fileName);
  const stem = path.basename(fileName, originalExtension);
  const base = slugify(stem) || "upload";
  return `${Date.now()}-${crypto.randomUUID()}-${base}${storedExtensionForMimeType(mimeType)}`;
}

export function formatByteSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${unit}`;
}

function mostPermissiveQuota(roles: readonly UserRole[], limits: Partial<Record<UserRole, number>>, fallback: number) {
  const configured = roles.map((role) => limits[role]).filter((value): value is number => value !== undefined);
  if (configured.length === 0) return fallback;
  if (configured.includes(0)) return 0;
  return Math.max(...configured);
}

export function resolveMediaUploadPolicy(
  roles: readonly UserRole[],
  settings: MediaUploadPolicySettings = {
    globalMaxUploadBytes: config.maxUploadBytes,
    siteQuotaBytes: config.mediaSiteQuotaBytes,
    userQuotaBytes: config.mediaUserQuotaBytes,
    allowedRoles: config.mediaUploadAllowedRoles,
    roleQuotaBytes: config.mediaRoleQuotaBytes,
    roleMaxUploadBytes: config.mediaRoleMaxUploadBytes,
  },
) {
  const uploadAllowed = roles.some((role) => settings.allowedRoles.has(role));
  const configuredRoleMaximums = roles
    .map((role) => settings.roleMaxUploadBytes[role])
    .filter((value): value is number => value !== undefined && value > 0);
  const roleMaximum = configuredRoleMaximums.length ? Math.max(...configuredRoleMaximums) : settings.globalMaxUploadBytes;
  return {
    uploadAllowed,
    maxUploadBytes: Math.min(settings.globalMaxUploadBytes, roleMaximum),
    siteQuotaBytes: settings.siteQuotaBytes,
    userQuotaBytes: mostPermissiveQuota(roles, settings.roleQuotaBytes, settings.userQuotaBytes),
  };
}

function storageState(usedBytes: number, quotaBytes: number) {
  return {
    usedBytes,
    quotaBytes,
    remainingBytes: quotaBytes > 0 ? Math.max(0, quotaBytes - usedBytes) : null,
    percentage: quotaBytes > 0 ? Math.min(100, (usedBytes / quotaBytes) * 100) : 0,
  };
}

export function mediaStorageState(usage: MediaStorageUsage) {
  return {
    site: storageState(usage.siteUsedBytes, usage.siteQuotaBytes),
    user: storageState(usage.userUsedBytes, usage.userQuotaBytes),
    maxUploadBytes: usage.maxUploadBytes,
    uploadAllowed: usage.uploadAllowed,
  };
}

async function userRolesAndUsage(userId: number) {
  const roleRows = await sql`
    select r.name
    from user_roles ur
    join roles r on r.id = ur.role_id
    where ur.user_id = ${userId}
  `;
  const usageRows = await sql`
    select
      (
        coalesce((select sum(size_bytes) from media_files), 0) +
        coalesce((select sum(size_bytes) from media_variants), 0)
      )::bigint as site_used_bytes,
      (
        coalesce((select sum(size_bytes) from media_files where uploaded_by = ${userId}), 0) +
        coalesce((
          select sum(v.size_bytes)
          from media_variants v
          join media_files m on m.id = v.media_id
          where m.uploaded_by = ${userId}
        ), 0)
      )::bigint as user_used_bytes
  `;
  return {
    roles: roleRows.map((row) => String(row.name) as UserRole),
    siteUsedBytes: Number(usageRows[0]?.site_used_bytes ?? 0),
    userUsedBytes: Number(usageRows[0]?.user_used_bytes ?? 0),
  };
}

export async function getMediaStorageUsage(userId: number): Promise<MediaStorageUsage> {
  const current = await userRolesAndUsage(userId);
  const policy = resolveMediaUploadPolicy(current.roles);
  return {
    siteUsedBytes: current.siteUsedBytes,
    siteQuotaBytes: policy.siteQuotaBytes,
    userUsedBytes: current.userUsedBytes,
    userQuotaBytes: policy.userQuotaBytes,
    maxUploadBytes: policy.maxUploadBytes,
    uploadAllowed: policy.uploadAllowed,
  };
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
      m.width,
      m.height,
      m.metadata,
      u.display_name as uploader_name,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', v.id,
          'kind', v.kind,
          'format', v.format,
          'mimeType', v.mime_type,
          'width', v.width,
          'height', v.height,
          'sizeBytes', v.size_bytes,
          'storedName', v.stored_name,
          'publicUrl', v.public_url
        ) order by v.kind, v.format)
        from media_variants v
        where v.media_id = m.id
      ), '[]'::jsonb) as variants
    from media_files m
    left join users u on u.id = m.uploaded_by
    order by m.created_at desc, m.id desc
  `;

  return rows.map((row) => normalizeMedia(row as Record<string, unknown>));
}

async function listDatabaseMediaReferenceSources(): Promise<MediaReferenceSource[]> {
  const rows = await sql`
    select source_type, source_id, title, field, value
    from (
      select 'post'::text as source_type, p.id::text as source_id, p.title, 'content'::text as field,
        concat_ws(E'\n', p.body_md, p.body_html, p.seo_og_image) as value
      from posts p
      union all
      select 'page', p.id::text, p.title, 'content',
        concat_ws(E'\n', p.body_md, p.body_html, p.seo_og_image)
      from pages p
      union all
      select 'block', b.id::text, b.title, 'body_html', b.body_html
      from content_blocks b
      union all
      select 'menu', m.id::text, m.title, 'items',
        coalesce(string_agg(mi.url, E'\n' order by mi.sort_order, mi.id), '')
      from menus m
      left join menu_items mi on mi.menu_id = m.id
      group by m.id
      union all
      select 'form', f.id::text, f.title, 'messages',
        concat_ws(E'\n', f.description, f.success_message)
      from forms f
      union all
      select 'revision', r.id::text,
        concat(upper(left(r.content_type, 1)), substring(r.content_type from 2), ' revision #', r.id),
        'snapshot', r.snapshot_json::text
      from content_revisions r
    ) media_sources
    where value <> ''
  `;

  return rows.map((row) => ({
    sourceType: String(row.source_type) as MediaReference["sourceType"],
    sourceId: String(row.source_id),
    title: String(row.title),
    field: String(row.field),
    value: String(row.value),
  }));
}

const publicReferenceExtensions = new Set([".html", ".htm", ".php", ".css", ".js", ".json", ".xml", ".md", ".txt"]);
const maxReferenceScanBytes = 2 * 1024 * 1024;

async function listPublicFileReferenceSources(): Promise<MediaReferenceSource[]> {
  const sources: MediaReferenceSource[] = [];
  const uploadDirectory = path.resolve(config.cmsUploadDir);

  async function visit(directory: string) {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
      const absolutePath = path.join(directory, entry.name);
      const resolvedPath = path.resolve(absolutePath);
      if (resolvedPath === uploadDirectory || resolvedPath.startsWith(`${uploadDirectory}${path.sep}`)) continue;
      if (entry.isDirectory()) {
        await visit(resolvedPath);
        continue;
      }
      if (!entry.isFile() || !publicReferenceExtensions.has(path.extname(entry.name).toLowerCase())) continue;
      const fileStat = await stat(resolvedPath).catch(() => null);
      if (!fileStat || fileStat.size > maxReferenceScanBytes) continue;
      const value = await readFile(resolvedPath, "utf8").catch(() => "");
      if (!value) continue;
      const relativePath = path.relative(config.publicHtmlDir, resolvedPath).split(path.sep).join("/");
      sources.push({
        sourceType: "public_file",
        sourceId: relativePath,
        title: relativePath,
        field: "file",
        value,
      });
    }
  }

  await visit(config.publicHtmlDir);
  return sources;
}

export async function listMediaUsage(): Promise<MediaUsageRecord[]> {
  const [media, databaseSources, publicSources] = await Promise.all([
    listMedia(),
    listDatabaseMediaReferenceSources(),
    listPublicFileReferenceSources(),
  ]);
  const sources = [...databaseSources, ...publicSources];
  return media.map((item) => ({ ...item, references: detectMediaReferences(item, sources) }));
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
      m.width,
      m.height,
      m.metadata,
      u.display_name as uploader_name,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', v.id,
          'kind', v.kind,
          'format', v.format,
          'mimeType', v.mime_type,
          'width', v.width,
          'height', v.height,
          'sizeBytes', v.size_bytes,
          'storedName', v.stored_name,
          'publicUrl', v.public_url
        ) order by v.kind, v.format)
        from media_variants v
        where v.media_id = m.id
      ), '[]'::jsonb) as variants
    from media_files m
    left join users u on u.id = m.uploaded_by
    where m.id = ${id}
    limit 1
  `;

  return rows[0] ? normalizeMedia(rows[0] as Record<string, unknown>) : null;
}

export async function uploadMedia(file: File, altText: string, userId: number) {
  if (!file.name) {
    throw new AppValidationError("A file name is required.");
  }
  if (file.size <= 0) {
    throw new AppValidationError("The uploaded file is empty.");
  }
  if (file.size > config.maxUploadBytes) {
    throw new AppValidationError(`The uploaded file exceeds the ${Math.ceil(config.maxUploadBytes / 1024 / 1024)} MB limit.`);
  }
  if (!isAllowedMimeType(file.type)) {
    throw new AppValidationError(`Unsupported file type: ${file.type || "unknown"}`);
  }
  await validateMediaFileContent(file);

  const content = file.type === "image/svg+xml" ? new Blob([sanitizeSvgContent(await file.text())], { type: file.type }) : file;
  const preflightRoleRows = await sql`
    select r.name
    from user_roles ur
    join roles r on r.id = ur.role_id
    where ur.user_id = ${userId}
  `;
  const preflightPolicy = resolveMediaUploadPolicy(preflightRoleRows.map((row) => String(row.name) as UserRole));
  if (!preflightPolicy.uploadAllowed) throw new AppValidationError("Your role is not allowed to upload media.");
  if (content.size > preflightPolicy.maxUploadBytes) throw new AppValidationError("The uploaded file exceeds the limit for your role.");

  const storedName = safeMediaStoredName(file.name, file.type);
  const destination = path.join(config.cmsUploadDir, storedName);
  const publicUrl = `/cms/uploads/${storedName}`;
  const imageResult = await processImageUpload(content, file.type, storedName);
  const derivativeBytes = imageResult?.variants.reduce((total, variant) => total + variant.sizeBytes, 0) ?? 0;
  const requiredStorageBytes = content.size + derivativeBytes;
  const writtenFiles: string[] = [];

  try {
    const id = await sql.begin(async (trx) => {
      await trx`select pg_advisory_xact_lock(861724501)`;
      const roleRows = await trx`
        select r.name
        from user_roles ur
        join roles r on r.id = ur.role_id
        where ur.user_id = ${userId}
      `;
      const roles = roleRows.map((row) => String(row.name) as UserRole);
      const policy = resolveMediaUploadPolicy(roles);
      if (!policy.uploadAllowed) throw new AppValidationError("Your role is not allowed to upload media.");
      if (content.size > policy.maxUploadBytes) throw new AppValidationError("The uploaded file exceeds the limit for your role.");

      const usageRows = await trx`
        select
          (
            coalesce((select sum(size_bytes) from media_files), 0) +
            coalesce((select sum(size_bytes) from media_variants), 0)
          )::bigint as site_used_bytes,
          (
            coalesce((select sum(size_bytes) from media_files where uploaded_by = ${userId}), 0) +
            coalesce((
              select sum(v.size_bytes)
              from media_variants v
              join media_files m on m.id = v.media_id
              where m.uploaded_by = ${userId}
            ), 0)
          )::bigint as user_used_bytes
      `;
      const siteUsedBytes = Number(usageRows[0]?.site_used_bytes ?? 0);
      const userUsedBytes = Number(usageRows[0]?.user_used_bytes ?? 0);
      if (policy.siteQuotaBytes > 0 && siteUsedBytes + requiredStorageBytes > policy.siteQuotaBytes) {
        throw new AppValidationError("The site media storage quota would be exceeded.");
      }
      if (policy.userQuotaBytes > 0 && userUsedBytes + requiredStorageBytes > policy.userQuotaBytes) {
        throw new AppValidationError("Your media storage quota would be exceeded.");
      }

      await mkdir(config.cmsUploadDir, { recursive: true });
      await Bun.write(destination, content);
      writtenFiles.push(destination);
      for (const variant of imageResult?.variants ?? []) {
        const variantDestination = path.join(config.cmsUploadDir, variant.storedName);
        await Bun.write(variantDestination, variant.content);
        writtenFiles.push(variantDestination);
      }

      const rows = await trx`
        insert into media_files (
          original_name,
          stored_name,
          mime_type,
          size_bytes,
          alt_text,
          uploaded_by,
          public_url,
          width,
          height,
          metadata
        ) values (
          ${file.name},
          ${storedName},
          ${file.type},
          ${content.size},
          ${altText || null},
          ${userId},
          ${publicUrl},
          ${imageResult?.width ?? null},
          ${imageResult?.height ?? null},
          ${trx.json(imageResult?.metadata ?? {})}
        )
        returning id
      `;
      const mediaId = Number(rows[0].id);
      for (const variant of imageResult?.variants ?? []) {
        await trx`
          insert into media_variants (
            media_id,
            kind,
            format,
            mime_type,
            width,
            height,
            size_bytes,
            stored_name,
            public_url
          ) values (
            ${mediaId},
            ${variant.kind},
            ${variant.format},
            ${variant.mimeType},
            ${variant.width},
            ${variant.height},
            ${variant.sizeBytes},
            ${variant.storedName},
            ${variant.publicUrl}
          )
        `;
      }
      return mediaId;
    });
    return getMediaById(id);
  } catch (error) {
    await Promise.all(writtenFiles.map((filePath) => unlink(filePath).catch(() => undefined)));
    throw error;
  }
}

async function deleteMediaRecord(media: MediaRecord) {
  await sql`delete from media_files where id = ${media.id}`;

  const files = [media.storedName, ...media.variants.map((variant) => variant.storedName)];
  await Promise.all(files.map((storedName) => unlink(path.join(config.cmsUploadDir, storedName)).catch(() => undefined)));
}

export async function deleteMedia(id: number) {
  const media = await getMediaById(id);
  if (!media) {
    return false;
  }

  const sources = [...await listDatabaseMediaReferenceSources(), ...await listPublicFileReferenceSources()];
  const references = detectMediaReferences(media, sources);
  if (references.length > 0) {
    throw new AppValidationError("Referenced media cannot be deleted. Remove its references first.");
  }
  await deleteMediaRecord(media);
  return true;
}

export async function deleteUnusedMedia(ids: readonly number[]) {
  const uniqueIds = [...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0))];
  const deleted: number[] = [];
  const skipped: number[] = [];
  for (const id of uniqueIds) {
    try {
      if (await deleteMedia(id)) deleted.push(id);
      else skipped.push(id);
    } catch (error) {
      if (error instanceof AppValidationError) {
        skipped.push(id);
        continue;
      }
      throw error;
    }
  }
  return { deleted, skipped };
}
