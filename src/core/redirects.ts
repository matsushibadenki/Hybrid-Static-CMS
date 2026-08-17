import path from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { config } from "./config";
import { bigintArray, sql } from "./db";
import { postPermalinkPath, type PermalinkPost, type PostPermalinkPattern } from "./permalinks";
import { AppValidationError, isUniqueConstraintError, requireNonEmpty } from "./validation";

export type RedirectStatusCode = 301 | 302 | 307 | 308;

export type SiteRedirect = {
  id: number;
  sourcePath: string;
  targetLocation: string;
  statusCode: RedirectStatusCode;
  enabled: boolean;
  automatic: boolean;
  note: string | null;
  hitCount: number;
  lastHitAt: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
};

export type NotFoundReport = {
  id: number;
  requestPath: string;
  hitCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  lastReferrerOrigin: string | null;
};

type RedirectInput = {
  sourcePath: string;
  targetLocation: string;
  statusCode: number;
  enabled: boolean;
  note?: string;
};

const allowedStatusCodes = new Set<number>([301, 302, 307, 308]);
const manifestPath = path.join(config.cmsOutputDir, "redirects.json");
const reservedPrefixes = [config.controlPanelPath, config.cmsApiPrefix, "/login", "/logout", "/setup", "/health", "/ready", "/preview"];

function normalizePathname(value: string) {
  const compact = value.replace(/\/+/g, "/");
  const normalized = path.posix.normalize(compact);
  return normalized.length > 1 ? normalized.replace(/\/$/, "") : normalized;
}

export function normalizeRedirectSource(input: string) {
  const value = input.trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("?") || value.includes("#")) {
    throw new AppValidationError("Redirect source must be an internal path without a query or fragment.");
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) throw new AppValidationError("Redirect source contains invalid characters.");
  const source = normalizePathname(new URL(value, config.appUrl).pathname);
  if (source.length > 2048) throw new AppValidationError("Redirect source is too long.");
  if (reservedPrefixes.some((prefix) => source === prefix || source.startsWith(`${prefix}/`))) {
    throw new AppValidationError("Redirect source cannot replace a protected application path.");
  }
  return source;
}

export function normalizeRedirectTarget(input: string) {
  const value = input.trim();
  requireNonEmpty(value, "Redirect target");
  if (/[\u0000-\u001f\u007f]/.test(value) || value.length > 4096) throw new AppValidationError("Redirect target is invalid or too long.");
  if (value.startsWith("/") && !value.startsWith("//")) {
    const target = new URL(value, config.appUrl);
    return `${normalizePathname(target.pathname)}${target.search}${target.hash}`;
  }
  let target: URL;
  try {
    target = new URL(value);
  } catch {
    throw new AppValidationError("Redirect target must be an internal path or an HTTPS URL.");
  }
  if (target.protocol !== "https:") throw new AppValidationError("External redirect targets must use HTTPS.");
  return target.toString();
}

function targetPathname(target: string) {
  if (!target.startsWith("/")) return null;
  return normalizePathname(new URL(target, config.appUrl).pathname);
}

async function validateInput(input: RedirectInput, excludeId?: number) {
  const sourcePath = normalizeRedirectSource(input.sourcePath);
  const targetLocation = normalizeRedirectTarget(input.targetLocation);
  if (!allowedStatusCodes.has(input.statusCode)) throw new AppValidationError("Select a valid redirect status code.");
  if ((input.note ?? "").length > 1_000) throw new AppValidationError("Redirect note must be 1000 characters or fewer.");
  if (targetPathname(targetLocation) === sourcePath) throw new AppValidationError("Redirect source and target cannot resolve to the same path.");

  let cursor = targetPathname(targetLocation);
  const visited = new Set([sourcePath]);
  for (let depth = 0; cursor && depth < 32; depth += 1) {
    if (visited.has(cursor)) throw new AppValidationError("This redirect would create a loop.");
    visited.add(cursor);
    const rows = excludeId
      ? await sql`select target_location from site_redirects where source_path = ${cursor} and enabled = true and id <> ${excludeId} limit 1`
      : await sql`select target_location from site_redirects where source_path = ${cursor} and enabled = true limit 1`;
    cursor = rows[0] ? targetPathname(String(rows[0].target_location)) : null;
  }
  return { sourcePath, targetLocation, statusCode: input.statusCode as RedirectStatusCode, enabled: input.enabled, note: input.note?.trim() || null };
}

function normalizeRedirect(row: Record<string, unknown>): SiteRedirect {
  return {
    id: Number(row.id), sourcePath: String(row.source_path), targetLocation: String(row.target_location),
    statusCode: Number(row.status_code) as RedirectStatusCode, enabled: Boolean(row.enabled), automatic: Boolean(row.automatic),
    note: (row.note as string | null) ?? null, hitCount: Number(row.hit_count ?? 0),
    lastHitAt: row.last_hit_at ? String(row.last_hit_at) : null, createdBy: row.created_by ? Number(row.created_by) : null,
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

function normalizeNotFound(row: Record<string, unknown>): NotFoundReport {
  return {
    id: Number(row.id), requestPath: String(row.request_path), hitCount: Number(row.hit_count),
    firstSeenAt: String(row.first_seen_at), lastSeenAt: String(row.last_seen_at),
    lastReferrerOrigin: (row.last_referrer_origin as string | null) ?? null,
  };
}

export async function listRedirects(search = "") {
  const query = search.trim().toLowerCase();
  const rows = query
    ? await sql`select * from site_redirects where lower(source_path) like ${`%${query}%`} or lower(target_location) like ${`%${query}%`} order by updated_at desc, id desc limit 500`
    : await sql`select * from site_redirects order by updated_at desc, id desc limit 500`;
  return rows.map((row) => normalizeRedirect(row as Record<string, unknown>));
}

export async function getRedirectById(id: number) {
  const rows = await sql`select * from site_redirects where id = ${id} limit 1`;
  return rows[0] ? normalizeRedirect(rows[0] as Record<string, unknown>) : null;
}

export async function createRedirect(input: RedirectInput, createdBy: number | null, automatic = false) {
  const value = await validateInput(input);
  try {
    const rows = await sql`
      insert into site_redirects (source_path, target_location, status_code, enabled, automatic, note, created_by)
      values (${value.sourcePath}, ${value.targetLocation}, ${value.statusCode}, ${value.enabled}, ${automatic}, ${value.note}, ${createdBy})
      returning id
    `;
    await writePublicRedirectManifest();
    return getRedirectById(Number(rows[0].id));
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new AppValidationError("A redirect already exists for this source path.");
    throw error;
  }
}

export async function updateRedirect(id: number, input: RedirectInput) {
  const value = await validateInput(input, id);
  try {
    await sql`
      update site_redirects set source_path = ${value.sourcePath}, target_location = ${value.targetLocation},
        status_code = ${value.statusCode}, enabled = ${value.enabled}, note = ${value.note}, automatic = false, updated_at = now()
      where id = ${id}
    `;
    await writePublicRedirectManifest();
    return getRedirectById(id);
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new AppValidationError("A redirect already exists for this source path.");
    throw error;
  }
}

export async function deleteRedirect(id: number) {
  await sql`delete from site_redirects where id = ${id}`;
  await writePublicRedirectManifest();
}

type RedirectManifest = {
  version: 1;
  generatedAt: string;
  redirects: Record<string, { location: string; status: RedirectStatusCode; id: number }>;
};

let manifestCache: { loadedAt: number; data: RedirectManifest } | null = null;

export async function writePublicRedirectManifest() {
  const rows = await sql`select id, source_path, target_location, status_code from site_redirects where enabled = true order by source_path asc`;
  const redirects = Object.fromEntries(rows.map((row) => [String(row.source_path), {
    location: String(row.target_location), status: Number(row.status_code) as RedirectStatusCode, id: Number(row.id),
  }]));
  const data: RedirectManifest = { version: 1, generatedAt: new Date().toISOString(), redirects };
  await mkdir(config.cmsOutputDir, { recursive: true });
  const temporaryPath = `${manifestPath}.tmp-${process.pid}-${crypto.randomUUID()}`;
  await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, { encoding: "utf8", mode: 0o644 });
  await rename(temporaryPath, manifestPath);
  manifestCache = { loadedAt: Date.now(), data };
  return data;
}

export async function findPublicRedirect(requestPath: string) {
  let sourcePath: string;
  try {
    sourcePath = normalizePathname(new URL(requestPath, config.appUrl).pathname);
  } catch {
    return null;
  }
  if (!manifestCache || Date.now() - manifestCache.loadedAt > 10_000) {
    try {
      const data = JSON.parse(await readFile(manifestPath, "utf8")) as RedirectManifest;
      manifestCache = data?.version === 1 && data.redirects ? { loadedAt: Date.now(), data } : null;
    } catch {
      manifestCache = null;
    }
  }
  return manifestCache?.data.redirects[sourcePath] ?? null;
}

export async function recordRedirectHit(id: number) {
  await sql`update site_redirects set hit_count = hit_count + 1, last_hit_at = now() where id = ${id}`;
}

function referrerOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    const origin = new URL(value).origin;
    return origin.length <= 500 ? origin : null;
  } catch {
    return null;
  }
}

export function shouldTrackNotFound(requestPath: string) {
  const normalized = normalizePathname(requestPath);
  return !reservedPrefixes.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

export async function recordNotFound(requestPath: string, referrer?: string) {
  const normalized = normalizePathname(new URL(requestPath, config.appUrl).pathname);
  if (!shouldTrackNotFound(normalized) || normalized.length > 2048) return;
  const origin = referrerOrigin(referrer);
  await sql`
    insert into not_found_reports (request_path, last_referrer_origin)
    select ${normalized}, ${origin}
    where exists (select 1 from not_found_reports where request_path = ${normalized})
       or (select count(*) from not_found_reports) < 10000
    on conflict (request_path) do update set
      hit_count = not_found_reports.hit_count + 1,
      last_seen_at = now(),
      last_referrer_origin = coalesce(excluded.last_referrer_origin, not_found_reports.last_referrer_origin)
  `;
}

export async function listNotFoundReports(search = "") {
  const query = search.trim().toLowerCase();
  const rows = query
    ? await sql`select * from not_found_reports where lower(request_path) like ${`%${query}%`} order by hit_count desc, last_seen_at desc limit 500`
    : await sql`select * from not_found_reports order by hit_count desc, last_seen_at desc limit 500`;
  return rows.map((row) => normalizeNotFound(row as Record<string, unknown>));
}

export async function getNotFoundReportById(id: number) {
  const rows = await sql`select * from not_found_reports where id = ${id} limit 1`;
  return rows[0] ? normalizeNotFound(rows[0] as Record<string, unknown>) : null;
}

export async function deleteNotFoundReport(id: number) {
  await sql`delete from not_found_reports where id = ${id}`;
}

export async function clearNotFoundReports() {
  const result = await sql`delete from not_found_reports`;
  return result.count;
}

async function upsertAutomaticRedirect(sourcePath: string, targetLocation: string, enabled: boolean, createdBy: number | null, note: string) {
  if (sourcePath === targetLocation) return;
  await sql`delete from site_redirects where automatic = true and source_path = ${targetLocation}`;
  let cursor: string | null = targetLocation;
  const visited = new Set<string>();
  for (let depth = 0; cursor && depth < 32; depth += 1) {
    if (cursor === sourcePath || visited.has(cursor)) return;
    visited.add(cursor);
    const nextRows: Array<{ target_location: unknown }> = await sql`select target_location from site_redirects where source_path = ${cursor} and enabled = true limit 1`;
    const nextTarget: string | null = nextRows[0] ? targetPathname(String(nextRows[0].target_location)) : null;
    cursor = nextTarget;
  }
  await sql`
    update site_redirects set target_location = ${targetLocation}, updated_at = now()
    where automatic = true and target_location = ${sourcePath} and source_path <> ${targetLocation}
  `;
  await sql`
    insert into site_redirects (source_path, target_location, status_code, enabled, automatic, note, created_by)
    values (${sourcePath}, ${targetLocation}, 301, ${enabled}, true, ${note}, ${createdBy})
    on conflict (source_path) do update set
      target_location = case when site_redirects.automatic then excluded.target_location else site_redirects.target_location end,
      enabled = case when site_redirects.automatic then excluded.enabled else site_redirects.enabled end,
      note = case when site_redirects.automatic then excluded.note else site_redirects.note end,
      updated_at = case when site_redirects.automatic then now() else site_redirects.updated_at end
  `;
}

export async function syncPostUrlRedirect(previous: PermalinkPost & { status: string }, current: PermalinkPost & { status: string }, pattern: PostPermalinkPattern, actorId: number | null) {
  const source = postPermalinkPath(previous, pattern);
  const target = postPermalinkPath(current, pattern);
  if (previous.status === "published" && source !== target) {
    await upsertAutomaticRedirect(source, target, current.status === "published", actorId, "Automatically created after a post URL change.");
  }
  if (current.status === "published") await sql`update site_redirects set enabled = true, updated_at = now() where automatic = true and target_location = ${target} and enabled = false`;
  await writePublicRedirectManifest();
}

export async function syncPageUrlRedirect(previous: { slug: string; status: string }, current: { slug: string; status: string }, actorId: number | null) {
  const source = `/cms/pages/${previous.slug}.html`;
  const target = `/cms/pages/${current.slug}.html`;
  if (previous.status === "published" && source !== target) {
    await upsertAutomaticRedirect(source, target, current.status === "published", actorId, "Automatically created after a fixed-page URL change.");
  }
  if (current.status === "published") await sql`update site_redirects set enabled = true, updated_at = now() where automatic = true and target_location = ${target} and enabled = false`;
  await writePublicRedirectManifest();
}

export async function createPermalinkPatternRedirects(previousPattern: PostPermalinkPattern, nextPattern: PostPermalinkPattern, actorId: number | null) {
  if (previousPattern === nextPattern) return 0;
  const rows = await sql`
    select p.id, p.slug, p.published_at, p.updated_at,
      coalesce((select array_agg(c.slug order by c.slug) from post_categories pc join categories c on c.id = pc.category_id where pc.post_id = p.id), '{}') as categories
    from posts p where p.status = 'published'
  `;
  let count = 0;
  for (const row of rows) {
    const post: PermalinkPost = {
      id: Number(row.id), slug: String(row.slug), publishedAt: row.published_at ? String(row.published_at) : null,
      updatedAt: String(row.updated_at), categories: Array.isArray(row.categories) ? row.categories as string[] : [],
    };
    const source = postPermalinkPath(post, previousPattern);
    const target = postPermalinkPath(post, nextPattern);
    if (source === target) continue;
    await upsertAutomaticRedirect(source, target, true, actorId, "Automatically created after a permalink structure change.");
    count += 1;
  }
  await writePublicRedirectManifest();
  return count;
}

export async function enableAutomaticRedirectsForPublishedContent(postIds: number[], pageIds: number[], pattern: PostPermalinkPattern) {
  const targets: string[] = [];
  if (postIds.length > 0) {
    const rows = await sql`
      select p.id, p.slug, p.published_at, p.updated_at,
        coalesce((select array_agg(c.slug order by c.slug) from post_categories pc join categories c on c.id = pc.category_id where pc.post_id = p.id), '{}') as categories
      from posts p where p.id = any(${bigintArray(postIds)}) and p.status = 'published'
    `;
    for (const row of rows) {
      targets.push(postPermalinkPath({
        id: Number(row.id), slug: String(row.slug), publishedAt: row.published_at ? String(row.published_at) : null,
        updatedAt: String(row.updated_at), categories: Array.isArray(row.categories) ? row.categories as string[] : [],
      }, pattern));
    }
  }
  if (pageIds.length > 0) {
    const rows = await sql`select slug from pages where id = any(${bigintArray(pageIds)}) and status = 'published'`;
    targets.push(...rows.map((row) => `/cms/pages/${String(row.slug)}.html`));
  }
  if (targets.length > 0) {
    await sql`update site_redirects set enabled = true, updated_at = now() where automatic = true and enabled = false and target_location = any(${sql.array(targets)})`;
    await writePublicRedirectManifest();
  }
}
