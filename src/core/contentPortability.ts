import { listPageGroups } from "./pageGroups";
import { createPage, listPages } from "./pages";
import { createPost, listPosts, setPostCommentsPolicy } from "./posts";
import { listSeries } from "./series";
import { sql } from "./db";
import { AppValidationError, validateSlug } from "./validation";

export const contentArchiveFormat = "hybrid-static-cms-content";
export const contentArchiveVersion = 1;
export const contentArchiveMaxBytes = 5 * 1024 * 1024;
export const contentArchiveMaxItems = 1_000;

type OptionalText = string | null;

export type PortablePost = {
  title: string;
  slug: string;
  excerpt: OptionalText;
  bodyMd: OptionalText;
  bodyHtml: string;
  sourceStatus: "draft" | "published" | "scheduled";
  publishedAt: OptionalText;
  seoTitle: OptionalText;
  seoDescription: OptionalText;
  seoCanonicalUrl: OptionalText;
  seoOgImage: OptionalText;
  seoKeywords: OptionalText;
  seoNoindex: boolean;
  seoNofollow: boolean;
  categories: string[];
  tags: string[];
  commentsPolicy: "inherit" | "enabled" | "disabled";
  seriesSlug: OptionalText;
};

export type PortablePage = {
  title: string;
  slug: string;
  excerpt: OptionalText;
  bodyMd: OptionalText;
  bodyHtml: string;
  sourceStatus: "draft" | "published" | "scheduled";
  publishedAt: OptionalText;
  seoTitle: OptionalText;
  seoDescription: OptionalText;
  seoCanonicalUrl: OptionalText;
  seoOgImage: OptionalText;
  seoKeywords: OptionalText;
  seoNoindex: boolean;
  seoNofollow: boolean;
  stylesheetPath: OptionalText;
  pageGroupSlug: OptionalText;
};

export type ContentArchive = {
  format: typeof contentArchiveFormat;
  version: typeof contentArchiveVersion;
  exportedAt: string;
  posts: PortablePost[];
  pages: PortablePage[];
};

export type ContentImportResult = {
  importedPosts: number;
  importedPages: number;
  skippedPosts: number;
  skippedPages: number;
  warnings: string[];
};

async function allPosts() {
  const items = [];
  for (let page = 1; ; page += 1) {
    const result = await listPosts({ page, limit: 50, status: "any" });
    items.push(...result.items);
    if (items.length >= result.total) return items;
  }
}

async function allPages() {
  const items = [];
  for (let page = 1; ; page += 1) {
    const result = await listPages({ page, limit: 50, status: "any" });
    items.push(...result.items);
    if (items.length >= result.total) return items;
  }
}

export async function createContentArchive(): Promise<ContentArchive> {
  const [posts, pages, series, pageGroups, postRelations, pageRelations] = await Promise.all([
    allPosts(),
    allPages(),
    listSeries(),
    listPageGroups(),
    sql`select post_id, series_id from post_series`,
    sql`select page_id, group_id from page_group_members`,
  ]);
  const seriesSlugById = new Map(series.map((item) => [item.id, item.slug]));
  const pageGroupSlugById = new Map(pageGroups.map((item) => [item.id, item.slug]));
  const seriesIdByPost = new Map(postRelations.map((row) => [Number(row.post_id), Number(row.series_id)]));
  const groupIdByPage = new Map(pageRelations.map((row) => [Number(row.page_id), Number(row.group_id)]));

  return {
    format: contentArchiveFormat,
    version: contentArchiveVersion,
    exportedAt: new Date().toISOString(),
    posts: posts.map((post) => ({
      title: post.title, slug: post.slug, excerpt: post.excerpt, bodyMd: post.bodyMd, bodyHtml: post.bodyHtml,
      sourceStatus: post.status, publishedAt: post.publishedAt,
      seoTitle: post.seoTitle, seoDescription: post.seoDescription, seoCanonicalUrl: post.seoCanonicalUrl,
      seoOgImage: post.seoOgImage, seoKeywords: post.seoKeywords, seoNoindex: post.seoNoindex, seoNofollow: post.seoNofollow,
      categories: post.categories, tags: post.tags, commentsPolicy: post.commentsPolicy,
      seriesSlug: seriesSlugById.get(seriesIdByPost.get(post.id) ?? -1) ?? null,
    })),
    pages: pages.map((page) => ({
      title: page.title, slug: page.slug, excerpt: page.excerpt, bodyMd: page.bodyMd, bodyHtml: page.bodyHtml,
      sourceStatus: page.status, publishedAt: page.publishedAt,
      seoTitle: page.seoTitle, seoDescription: page.seoDescription, seoCanonicalUrl: page.seoCanonicalUrl,
      seoOgImage: page.seoOgImage, seoKeywords: page.seoKeywords, seoNoindex: page.seoNoindex, seoNofollow: page.seoNofollow,
      stylesheetPath: page.stylesheetPath,
      pageGroupSlug: pageGroupSlugById.get(groupIdByPage.get(page.id) ?? -1) ?? null,
    })),
  };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AppValidationError(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) throw new AppValidationError(`${label} is required.`);
  if (value.length > maxLength) throw new AppValidationError(`${label} is too long.`);
  return value;
}

function text(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string") throw new AppValidationError(`${label} must be text.`);
  if (value.length > maxLength) throw new AppValidationError(`${label} is too long.`);
  return value;
}

function optionalText(value: unknown, label: string, maxLength: number): OptionalText {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new AppValidationError(`${label} must be text or null.`);
  if (value.length > maxLength) throw new AppValidationError(`${label} is too long.`);
  return value;
}

function bool(value: unknown, label: string) {
  if (typeof value !== "boolean") throw new AppValidationError(`${label} must be true or false.`);
  return value;
}

function choice<T extends string>(value: unknown, choices: readonly T[], label: string): T {
  if (typeof value !== "string" || !choices.includes(value as T)) throw new AppValidationError(`${label} is invalid.`);
  return value as T;
}

function slug(value: unknown, label: string) {
  const result = requiredText(value, label, 240);
  validateSlug(result, label);
  return result;
}

function slugList(value: unknown, label: string) {
  if (!Array.isArray(value) || value.length > 100) throw new AppValidationError(`${label} must be an array with no more than 100 items.`);
  return [...new Set(value.map((item, index) => slug(item, `${label} #${index + 1}`)))];
}

function parsePost(value: unknown, index: number): PortablePost {
  const item = record(value, `Post #${index + 1}`);
  return {
    title: requiredText(item.title, `Post #${index + 1} title`, 300),
    slug: slug(item.slug, `Post #${index + 1} slug`),
    excerpt: optionalText(item.excerpt, `Post #${index + 1} excerpt`, 20_000),
    bodyMd: optionalText(item.bodyMd, `Post #${index + 1} bodyMd`, 2_000_000),
    bodyHtml: text(item.bodyHtml, `Post #${index + 1} bodyHtml`, 2_000_000),
    sourceStatus: choice(item.sourceStatus, ["draft", "published", "scheduled"] as const, `Post #${index + 1} sourceStatus`),
    publishedAt: optionalText(item.publishedAt, `Post #${index + 1} publishedAt`, 100),
    seoTitle: optionalText(item.seoTitle, `Post #${index + 1} seoTitle`, 500),
    seoDescription: optionalText(item.seoDescription, `Post #${index + 1} seoDescription`, 5_000),
    seoCanonicalUrl: optionalText(item.seoCanonicalUrl, `Post #${index + 1} seoCanonicalUrl`, 2_000),
    seoOgImage: optionalText(item.seoOgImage, `Post #${index + 1} seoOgImage`, 2_000),
    seoKeywords: optionalText(item.seoKeywords, `Post #${index + 1} seoKeywords`, 5_000),
    seoNoindex: bool(item.seoNoindex, `Post #${index + 1} seoNoindex`),
    seoNofollow: bool(item.seoNofollow, `Post #${index + 1} seoNofollow`),
    categories: slugList(item.categories, `Post #${index + 1} categories`),
    tags: slugList(item.tags, `Post #${index + 1} tags`),
    commentsPolicy: choice(item.commentsPolicy, ["inherit", "enabled", "disabled"] as const, `Post #${index + 1} commentsPolicy`),
    seriesSlug: item.seriesSlug == null ? null : slug(item.seriesSlug, `Post #${index + 1} seriesSlug`),
  };
}

function parsePage(value: unknown, index: number): PortablePage {
  const item = record(value, `Page #${index + 1}`);
  return {
    title: requiredText(item.title, `Page #${index + 1} title`, 300),
    slug: slug(item.slug, `Page #${index + 1} slug`),
    excerpt: optionalText(item.excerpt, `Page #${index + 1} excerpt`, 20_000),
    bodyMd: optionalText(item.bodyMd, `Page #${index + 1} bodyMd`, 2_000_000),
    bodyHtml: text(item.bodyHtml, `Page #${index + 1} bodyHtml`, 2_000_000),
    sourceStatus: choice(item.sourceStatus, ["draft", "published", "scheduled"] as const, `Page #${index + 1} sourceStatus`),
    publishedAt: optionalText(item.publishedAt, `Page #${index + 1} publishedAt`, 100),
    seoTitle: optionalText(item.seoTitle, `Page #${index + 1} seoTitle`, 500),
    seoDescription: optionalText(item.seoDescription, `Page #${index + 1} seoDescription`, 5_000),
    seoCanonicalUrl: optionalText(item.seoCanonicalUrl, `Page #${index + 1} seoCanonicalUrl`, 2_000),
    seoOgImage: optionalText(item.seoOgImage, `Page #${index + 1} seoOgImage`, 2_000),
    seoKeywords: optionalText(item.seoKeywords, `Page #${index + 1} seoKeywords`, 5_000),
    seoNoindex: bool(item.seoNoindex, `Page #${index + 1} seoNoindex`),
    seoNofollow: bool(item.seoNofollow, `Page #${index + 1} seoNofollow`),
    stylesheetPath: optionalText(item.stylesheetPath, `Page #${index + 1} stylesheetPath`, 500),
    pageGroupSlug: item.pageGroupSlug == null ? null : slug(item.pageGroupSlug, `Page #${index + 1} pageGroupSlug`),
  };
}

export function parseContentArchive(json: string): ContentArchive {
  if (Buffer.byteLength(json, "utf8") > contentArchiveMaxBytes) throw new AppValidationError("The import file exceeds the 5 MB limit.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new AppValidationError("The import file is not valid JSON.");
  }
  const archive = record(parsed, "Import file");
  if (archive.format !== contentArchiveFormat || archive.version !== contentArchiveVersion) {
    throw new AppValidationError("The import file format or version is not supported.");
  }
  if (!Array.isArray(archive.posts) || !Array.isArray(archive.pages)) throw new AppValidationError("The import file must contain posts and pages arrays.");
  if (archive.posts.length + archive.pages.length > contentArchiveMaxItems) throw new AppValidationError("The import file contains more than 1000 content items.");
  const posts = archive.posts.map(parsePost);
  const pages = archive.pages.map(parsePage);
  for (const [label, slugs] of [["post", posts.map((item) => item.slug)], ["page", pages.map((item) => item.slug)]] as const) {
    if (new Set(slugs).size !== slugs.length) throw new AppValidationError(`The import file contains duplicate ${label} slugs.`);
  }
  return {
    format: contentArchiveFormat,
    version: contentArchiveVersion,
    exportedAt: requiredText(archive.exportedAt, "exportedAt", 100),
    posts,
    pages,
  };
}

export async function importContentArchive(archive: ContentArchive, authorId: number): Promise<ContentImportResult> {
  const [existingPostRows, existingPageRows, series, pageGroups] = await Promise.all([
    sql`select slug from posts`,
    sql`select slug from pages`,
    listSeries(),
    listPageGroups(),
  ]);
  const existingPostSlugs = new Set(existingPostRows.map((row) => String(row.slug)));
  const existingPageSlugs = new Set(existingPageRows.map((row) => String(row.slug)));
  const seriesBySlug = new Map(series.map((item) => [item.slug, item.id]));
  const pageGroupBySlug = new Map(pageGroups.map((item) => [item.slug, item.id]));
  const result: ContentImportResult = { importedPosts: 0, importedPages: 0, skippedPosts: 0, skippedPages: 0, warnings: [] };

  for (const post of archive.posts) {
    if (existingPostSlugs.has(post.slug)) {
      result.skippedPosts += 1;
      result.warnings.push(`Skipped post "${post.slug}" because its slug already exists.`);
      continue;
    }
    const seriesId = post.seriesSlug ? seriesBySlug.get(post.seriesSlug) ?? null : null;
    if (post.seriesSlug && !seriesId) result.warnings.push(`Imported post "${post.slug}" without the missing series "${post.seriesSlug}".`);
    const created = await createPost({
      title: post.title, slug: post.slug, excerpt: post.excerpt ?? undefined,
      bodyMd: post.bodyMd ?? undefined, bodyHtml: post.bodyHtml, status: "draft", publishedAt: null,
      seoTitle: post.seoTitle ?? undefined, seoDescription: post.seoDescription ?? undefined,
      seoCanonicalUrl: post.seoCanonicalUrl ?? undefined, seoOgImage: post.seoOgImage ?? undefined,
      seoKeywords: post.seoKeywords ?? undefined, seoNoindex: post.seoNoindex, seoNofollow: post.seoNofollow,
      categorySlugs: post.categories, tagSlugs: post.tags, seriesId,
    }, authorId);
    if (created) await setPostCommentsPolicy(created.id, post.commentsPolicy);
    existingPostSlugs.add(post.slug);
    result.importedPosts += 1;
  }

  for (const page of archive.pages) {
    if (existingPageSlugs.has(page.slug)) {
      result.skippedPages += 1;
      result.warnings.push(`Skipped page "${page.slug}" because its slug already exists.`);
      continue;
    }
    const pageGroupId = page.pageGroupSlug ? pageGroupBySlug.get(page.pageGroupSlug) ?? null : null;
    if (page.pageGroupSlug && !pageGroupId) result.warnings.push(`Imported page "${page.slug}" without the missing page group "${page.pageGroupSlug}".`);
    if (page.stylesheetPath) result.warnings.push(`Imported page "${page.slug}" without stylesheet "${page.stylesheetPath}"; copy and assign the asset separately.`);
    await createPage({
      title: page.title, slug: page.slug, excerpt: page.excerpt ?? undefined,
      bodyMd: page.bodyMd ?? undefined, bodyHtml: page.bodyHtml, status: "draft", publishedAt: null,
      seoTitle: page.seoTitle ?? undefined, seoDescription: page.seoDescription ?? undefined,
      seoCanonicalUrl: page.seoCanonicalUrl ?? undefined, seoOgImage: page.seoOgImage ?? undefined,
      seoKeywords: page.seoKeywords ?? undefined, seoNoindex: page.seoNoindex, seoNofollow: page.seoNofollow,
      pageGroupId, stylesheetPath: null,
    }, authorId);
    existingPageSlugs.add(page.slug);
    result.importedPages += 1;
  }
  return result;
}
