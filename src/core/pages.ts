import { renderMarkdownLike, sanitizeRichHtml } from "./content";
import { sql, withTransaction } from "./db";
import {
  AppValidationError,
  isUniqueConstraintError,
  requireNonEmpty,
  validateScheduledState,
  validateSlug,
} from "./validation";
import type { PageInput, PageRecord } from "./types";
import { createContentRevision } from "./revisions";
import { requireExistingStylesheet } from "./assets";

function normalizePage(row: Record<string, unknown>): PageRecord {
  return {
    id: Number(row.id),
    title: String(row.title),
    slug: String(row.slug),
    excerpt: (row.excerpt as string | null) ?? null,
    bodyMd: (row.body_md as string | null) ?? null,
    bodyHtml: String(row.body_html ?? ""),
    status: row.status as PageRecord["status"],
    seoTitle: (row.seo_title as string | null) ?? null,
    seoDescription: (row.seo_description as string | null) ?? null,
    seoCanonicalUrl: (row.seo_canonical_url as string | null) ?? null,
    seoOgImage: (row.seo_og_image as string | null) ?? null,
    seoKeywords: (row.seo_keywords as string | null) ?? null,
    seoNoindex: Boolean(row.seo_noindex),
    seoNofollow: Boolean(row.seo_nofollow),
    publishedAt: row.published_at ? String(row.published_at) : null,
    updatedAt: String(row.updated_at),
    authorId: row.author_id ? Number(row.author_id) : null,
    authorName: (row.author_name as string | null) ?? null,
    stylesheetPath: (row.stylesheet_path as string | null) ?? null,
  };
}

function deriveBodyHtml(input: PageInput) {
  if (input.bodyHtml?.trim()) {
    return sanitizeRichHtml(input.bodyHtml);
  }
  return renderMarkdownLike(input.bodyMd ?? "");
}

function validatePageInput(input: PageInput) {
  requireNonEmpty(input.title, "Title");
  validateSlug(input.slug);
  validateScheduledState(input.status, input.publishedAt);
}

async function syncPageGroup(pageId: number, groupId: number | null, trx: typeof sql) {
  if (!groupId) {
    await trx`delete from page_group_members where page_id = ${pageId}`;
    return;
  }
  const result = await trx`
    insert into page_group_members (page_id, group_id, position)
    select ${pageId}, id, 0 from page_groups where id = ${groupId}
    on conflict (page_id) do update set
      group_id = excluded.group_id,
      position = case when page_group_members.group_id = excluded.group_id then page_group_members.position else 0 end
  `;
  if (result.count === 0) throw new AppValidationError("Selected page group does not exist.");
}

const basePageQuery = `
  select
    p.id,
    p.title,
    p.slug,
    p.excerpt,
    p.body_md,
    p.body_html,
    p.status,
    p.seo_title,
    p.seo_description,
    p.seo_canonical_url,
    p.seo_og_image,
    p.seo_keywords,
    p.seo_noindex,
    p.seo_nofollow,
    p.published_at,
    p.updated_at,
    p.author_id,
    p.stylesheet_path,
    u.display_name as author_name
  from pages p
  left join users u on u.id = p.author_id
`;

export async function listPages(options: { page?: number; limit?: number; status?: string; search?: string }) {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.max(1, Math.min(50, options.limit ?? 10));
  const offset = (page - 1) * limit;
  const status = options.status ?? "published";
  const search = options.search?.trim();

  const filters: string[] = [];
  const params: (string | number)[] = [];

  if (status !== "any") {
    params.push(status);
    filters.push(`p.status = $${params.length}`);
  }

  if (search) {
    params.push(search);
    filters.push(`p.search_vector @@ websearch_to_tsquery('english', $${params.length})`);
  }

  const whereSql = filters.length > 0 ? `where ${filters.join(" and ")}` : "";

  const rows = await sql.unsafe(
    `
      ${basePageQuery}
      ${whereSql}
      order by coalesce(p.published_at, p.created_at) desc, p.id desc
      limit ${limit}
      offset ${offset}
    `,
    params as any[],
  );

  const count = await sql.unsafe(`select count(*)::int as total from pages p ${whereSql}`, params as any[]);

  return {
    page,
    limit,
    total: Number(count[0]?.total ?? 0),
    items: rows.map((row) => normalizePage(row as Record<string, unknown>)),
  };
}

export async function getPageById(id: number) {
  const rows = await sql.unsafe(`${basePageQuery} where p.id = $1 limit 1`, [id]);
  return rows[0] ? normalizePage(rows[0] as Record<string, unknown>) : null;
}

export async function getPageBySlug(slug: string, status = "published") {
  const rows = await sql.unsafe(
    `${basePageQuery} where p.slug = $1 and ($2 = 'any' or p.status = $2) limit 1`,
    [slug, status],
  );
  return rows[0] ? normalizePage(rows[0] as Record<string, unknown>) : null;
}

export async function createPage(input: PageInput, authorId: number) {
  validatePageInput(input);
  const bodyHtml = deriveBodyHtml(input);
  const stylesheetPath = await requireExistingStylesheet(input.stylesheetPath, "pages");
  let pageId: number;
  try {
    pageId = await withTransaction(async (trx) => {
      const rows = await trx`
        insert into pages (
        title,
        slug,
        excerpt,
        body_md,
        body_html,
        status,
        author_id,
        published_at,
        seo_title,
        seo_description,
        seo_canonical_url,
        seo_og_image,
        seo_keywords,
        seo_noindex,
        seo_nofollow,
        stylesheet_path
      ) values (
        ${input.title},
        ${input.slug},
        ${input.excerpt ?? null},
        ${input.bodyMd ?? null},
        ${bodyHtml},
        ${input.status},
        ${authorId},
        ${input.publishedAt ?? (input.status === "published" ? new Date().toISOString() : null)},
        ${input.seoTitle ?? null},
        ${input.seoDescription ?? null},
        ${input.seoCanonicalUrl ?? null},
        ${input.seoOgImage ?? null},
        ${input.seoKeywords ?? null},
        ${input.seoNoindex ?? false},
        ${input.seoNofollow ?? false},
        ${stylesheetPath}
      )
        returning id
      `;
      const id = Number(rows[0].id);
      if (input.pageGroupId) await syncPageGroup(id, input.pageGroupId, trx as typeof sql);
      return id;
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppValidationError(`Slug "${input.slug}" is already in use.`);
    }
    throw error;
  }

  return getPageById(pageId);
}

export async function updatePage(id: number, input: PageInput, actorUserId?: number | null) {
  validatePageInput(input);
  const previous = await getPageById(id);
  const bodyHtml = deriveBodyHtml(input);
  const stylesheetPath = await requireExistingStylesheet(input.stylesheetPath, "pages");
  try {
    await withTransaction(async (trx) => {
      await trx`
        update pages
      set
        title = ${input.title},
        slug = ${input.slug},
        excerpt = ${input.excerpt ?? null},
        body_md = ${input.bodyMd ?? null},
        body_html = ${bodyHtml},
        status = ${input.status},
        published_at = ${input.publishedAt ?? (input.status === "published" ? new Date().toISOString() : null)},
        seo_title = ${input.seoTitle ?? null},
        seo_description = ${input.seoDescription ?? null},
        seo_canonical_url = ${input.seoCanonicalUrl ?? null},
        seo_og_image = ${input.seoOgImage ?? null},
          seo_keywords = ${input.seoKeywords ?? null},
          seo_noindex = ${input.seoNoindex ?? false},
          seo_nofollow = ${input.seoNofollow ?? false},
          stylesheet_path = ${stylesheetPath},
          scheduled_publish_attempts = 0,
          scheduled_publish_next_retry_at = null,
          scheduled_publish_last_error = null,
          updated_at = now()
        where id = ${id}
      `;
      if (input.pageGroupId !== undefined) await syncPageGroup(id, input.pageGroupId, trx as typeof sql);
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppValidationError(`Slug "${input.slug}" is already in use.`);
    }
    throw error;
  }

  if (previous) {
    await createContentRevision("page", id, previous, actorUserId ?? previous.authorId);
  }

  return getPageById(id);
}

export async function deletePage(id: number) {
  await sql`delete from pages where id = ${id}`;
}
