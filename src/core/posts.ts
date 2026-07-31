import { sql, withTransaction } from "./db";
import { renderMarkdownLike, sanitizeRichHtml } from "./content";
import {
  AppValidationError,
  isUniqueConstraintError,
  requireNonEmpty,
  validateScheduledState,
  validateSlug,
} from "./validation";
import type { PostInput, PostRecord } from "./types";
import { createContentRevision } from "./revisions";

function normalizePost(row: Record<string, unknown>): PostRecord {
  return {
    id: Number(row.id),
    title: String(row.title),
    slug: String(row.slug),
    excerpt: (row.excerpt as string | null) ?? null,
    bodyMd: (row.body_md as string | null) ?? null,
    bodyHtml: String(row.body_html ?? ""),
    status: row.status as PostRecord["status"],
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
    categories: Array.isArray(row.categories) ? (row.categories as string[]) : [],
    categoryStylesheets: Array.isArray(row.category_stylesheets) ? (row.category_stylesheets as string[]) : [],
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    commentsPolicy: row.comments_policy as PostRecord["commentsPolicy"],
    commentsEnabled: Boolean(row.comments_enabled),
  };
}

function deriveBodyHtml(input: PostInput) {
  if (input.bodyHtml?.trim()) {
    return sanitizeRichHtml(input.bodyHtml);
  }
  return renderMarkdownLike(input.bodyMd ?? "");
}

function validatePostInput(input: PostInput) {
  requireNonEmpty(input.title, "Title");
  validateSlug(input.slug);
  validateScheduledState(input.status, input.publishedAt);
}

async function ensureTerms(type: "category" | "tag", slugs: string[], trx: typeof sql) {
  if (slugs.length === 0) {
    return;
  }

  const table = type === "category" ? "categories" : "tags";
  for (const slug of slugs) {
    await trx.unsafe(
      `insert into ${table} (name, slug) values ($1, $2) on conflict (slug) do nothing`,
      [slug, slug],
    );
  }
}

async function syncTerms(postId: number, categorySlugs: string[], tagSlugs: string[], trx: typeof sql) {
  await trx`delete from post_categories where post_id = ${postId}`;
  await trx`delete from post_tags where post_id = ${postId}`;

  if (categorySlugs.length > 0) {
    await ensureTerms("category", categorySlugs, trx);
    await trx`
      insert into post_categories (post_id, category_id)
      select ${postId}, id from categories
      where slug = any(${trx.array(categorySlugs)})
    `;
  }

  if (tagSlugs.length > 0) {
    await ensureTerms("tag", tagSlugs, trx);
    await trx`
      insert into post_tags (post_id, tag_id)
      select ${postId}, id from tags
      where slug = any(${trx.array(tagSlugs)})
    `;
  }
}

async function syncSeries(postId: number, seriesId: number | null, trx: typeof sql) {
  if (!seriesId) {
    await trx`delete from post_series where post_id = ${postId}`;
    return;
  }
  const result = await trx`
    insert into post_series (post_id, series_id, position)
    select ${postId}, id, 0 from series where id = ${seriesId}
    on conflict (post_id) do update set
      series_id = excluded.series_id,
      position = case when post_series.series_id = excluded.series_id then post_series.position else 0 end
  `;
  if (result.count === 0) throw new AppValidationError("Selected series does not exist.");
}

const basePostQuery = `
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
    p.comments_policy,
    case
      when exists (select 1 from post_series eps where eps.post_id = p.id) then
        coalesce((select es.comments_enabled from post_series eps join series es on es.id = eps.series_id where eps.post_id = p.id limit 1), false)
        and p.comments_policy <> 'disabled'
      else p.comments_policy = 'enabled'
    end as comments_enabled,
    u.display_name as author_name,
    coalesce(array_agg(distinct c.slug order by c.slug) filter (where c.slug is not null), '{}') as categories,
    coalesce(array_agg(distinct c.stylesheet_path order by c.stylesheet_path) filter (where c.stylesheet_path is not null), '{}') as category_stylesheets,
    coalesce(array_agg(distinct t.slug order by t.slug) filter (where t.slug is not null), '{}') as tags
  from posts p
  left join users u on u.id = p.author_id
  left join post_categories pc on pc.post_id = p.id
  left join categories c on c.id = pc.category_id
  left join post_tags pt on pt.post_id = p.id
  left join tags t on t.id = pt.tag_id
`;

export async function listPosts(options: {
  page?: number;
  limit?: number;
  status?: string;
  category?: string;
  search?: string;
}) {
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

  if (options.category) {
    params.push(options.category);
    filters.push(`exists (select 1 from post_categories xpc join categories xc on xc.id = xpc.category_id where xpc.post_id = p.id and xc.slug = $${params.length})`);
  }

  if (search) {
    params.push(search);
    filters.push(`p.search_vector @@ websearch_to_tsquery('english', $${params.length})`);
  }

  const whereSql = filters.length > 0 ? `where ${filters.join(" and ")}` : "";

  const rows = await sql.unsafe(
    `
      ${basePostQuery}
      ${whereSql}
      group by p.id, u.id
      order by coalesce(p.published_at, p.created_at) desc, p.id desc
      limit ${limit}
      offset ${offset}
    `,
    params as any[],
  );

  const countResult = await sql.unsafe(
    `select count(*)::int as total from posts p ${whereSql}`,
    params as any[],
  );

  return {
    page,
    limit,
    total: Number(countResult[0]?.total ?? 0),
    items: rows.map((row) => normalizePost(row as Record<string, unknown>)),
  };
}

export async function getPostBySlug(slug: string, status: string = "published") {
  const rows = await sql.unsafe(
    `
      ${basePostQuery}
      where p.slug = $1 and ($2 = 'any' or p.status = $2)
      group by p.id, u.id
      limit 1
    `,
    [slug, status],
  );

  if (!rows[0]) {
    return null;
  }

  return normalizePost(rows[0] as Record<string, unknown>);
}

export async function getPostById(id: number) {
  const rows = await sql.unsafe(
    `
      ${basePostQuery}
      where p.id = $1
      group by p.id, u.id
      limit 1
    `,
    [id],
  );

  if (!rows[0]) {
    return null;
  }

  return normalizePost(rows[0] as Record<string, unknown>);
}

export async function createPost(input: PostInput, authorId: number) {
  validatePostInput(input);
  const bodyHtml = deriveBodyHtml(input);
  const categorySlugs = (input.categorySlugs ?? []).filter(Boolean);
  const tagSlugs = (input.tagSlugs ?? []).filter(Boolean);

  let result: number;
  try {
    result = await withTransaction(async (trx) => {
      const rows = await trx`
        insert into posts (
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
          seo_nofollow
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
          ${input.seoNofollow ?? false}
        )
        returning id
      `;

      const postId = Number(rows[0].id);
      await syncTerms(postId, categorySlugs, tagSlugs, trx as typeof sql);
      if (input.seriesId) await syncSeries(postId, input.seriesId, trx as typeof sql);
      return postId;
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppValidationError(`Slug "${input.slug}" is already in use.`);
    }
    throw error;
  }

  return getPostById(result);
}

export async function updatePost(id: number, input: PostInput, actorUserId?: number | null) {
  validatePostInput(input);
  const previous = await getPostById(id);
  const bodyHtml = deriveBodyHtml(input);
  const categorySlugs = (input.categorySlugs ?? []).filter(Boolean);
  const tagSlugs = (input.tagSlugs ?? []).filter(Boolean);

  try {
    await withTransaction(async (trx) => {
      await trx`
        update posts
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
          scheduled_publish_attempts = 0,
          scheduled_publish_next_retry_at = null,
          scheduled_publish_last_error = null,
          updated_at = now()
        where id = ${id}
      `;

      await syncTerms(id, categorySlugs, tagSlugs, trx as typeof sql);
      if (input.seriesId !== undefined) await syncSeries(id, input.seriesId, trx as typeof sql);
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppValidationError(`Slug "${input.slug}" is already in use.`);
    }
    throw error;
  }

  if (previous) {
    await createContentRevision("post", id, previous, actorUserId ?? previous.authorId);
  }

  return getPostById(id);
}

export async function deletePost(id: number) {
  await sql`delete from posts where id = ${id}`;
}

export async function setPostCommentsPolicy(id: number, policy: PostRecord["commentsPolicy"]) {
  if (!["inherit", "enabled", "disabled"].includes(policy)) throw new AppValidationError("Select a valid comment setting.");
  await sql`update posts set comments_policy = ${policy}, updated_at = now() where id = ${id}`;
  return getPostById(id);
}
