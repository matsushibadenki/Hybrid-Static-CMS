import { sql, withTransaction } from "./db";
import { renderMarkdownLike, sanitizeRichHtml } from "./content";
import type { PostInput, PostRecord } from "./types";

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
    seoNoindex: Boolean(row.seo_noindex),
    seoNofollow: Boolean(row.seo_nofollow),
    publishedAt: row.published_at ? String(row.published_at) : null,
    updatedAt: String(row.updated_at),
    authorId: row.author_id ? Number(row.author_id) : null,
    authorName: (row.author_name as string | null) ?? null,
    categories: Array.isArray(row.categories) ? (row.categories as string[]) : [],
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
  };
}

function deriveBodyHtml(input: PostInput) {
  if (input.bodyHtml?.trim()) {
    return sanitizeRichHtml(input.bodyHtml);
  }
  return renderMarkdownLike(input.bodyMd ?? "");
}

async function ensureTerms(type: "category" | "tag", slugs: string[]) {
  if (slugs.length === 0) {
    return;
  }

  const table = type === "category" ? "categories" : "tags";
  for (const slug of slugs) {
    await sql.unsafe(
      `insert into ${table} (name, slug) values ($1, $2) on conflict (slug) do nothing`,
      [slug, slug],
    );
  }
}

async function syncTerms(postId: number, categorySlugs: string[], tagSlugs: string[], trx: typeof sql) {
  await trx`delete from post_categories where post_id = ${postId}`;
  await trx`delete from post_tags where post_id = ${postId}`;

  if (categorySlugs.length > 0) {
    await ensureTerms("category", categorySlugs);
    await trx`
      insert into post_categories (post_id, category_id)
      select ${postId}, id from categories
      where slug = any(${trx.array(categorySlugs)})
    `;
  }

  if (tagSlugs.length > 0) {
    await ensureTerms("tag", tagSlugs);
    await trx`
      insert into post_tags (post_id, tag_id)
      select ${postId}, id from tags
      where slug = any(${trx.array(tagSlugs)})
    `;
  }
}

const basePostQuery = sql`
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
    p.seo_noindex,
    p.seo_nofollow,
    p.published_at,
    p.updated_at,
    p.author_id,
    u.display_name as author_name,
    coalesce(array_agg(distinct c.slug) filter (where c.slug is not null), '{}') as categories,
    coalesce(array_agg(distinct t.slug) filter (where t.slug is not null), '{}') as tags
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
  const bodyHtml = deriveBodyHtml(input);
  const categorySlugs = (input.categorySlugs ?? []).filter(Boolean);
  const tagSlugs = (input.tagSlugs ?? []).filter(Boolean);

  const result = await withTransaction(async (trx) => {
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
        ${input.seoNoindex ?? false},
        ${input.seoNofollow ?? false}
      )
      returning id
    `;

    const postId = Number(rows[0].id);
    await syncTerms(postId, categorySlugs, tagSlugs, trx as typeof sql);
    return postId;
  });

  return getPostById(result);
}

export async function updatePost(id: number, input: PostInput) {
  const bodyHtml = deriveBodyHtml(input);
  const categorySlugs = (input.categorySlugs ?? []).filter(Boolean);
  const tagSlugs = (input.tagSlugs ?? []).filter(Boolean);

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
        seo_noindex = ${input.seoNoindex ?? false},
        seo_nofollow = ${input.seoNofollow ?? false},
        updated_at = now()
      where id = ${id}
    `;

    await syncTerms(id, categorySlugs, tagSlugs, trx as typeof sql);
  });

  return getPostById(id);
}

export async function deletePost(id: number) {
  await sql`delete from posts where id = ${id}`;
}
