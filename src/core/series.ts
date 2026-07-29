import { bigintArray, sql } from "./db";
import { AppValidationError, isUniqueConstraintError, requireNonEmpty, validateSlug } from "./validation";

export type SeriesRecord = {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  postCount: number;
  commentsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SeriesNavigationPost = {
  id: number;
  title: string;
  slug: string;
  position: number;
  publishedAt: string | null;
  updatedAt: string;
  categories: string[];
};

export type SeriesNavigation = {
  id: number;
  title: string;
  slug: string;
  posts: SeriesNavigationPost[];
};

function normalize(row: Record<string, unknown>): SeriesRecord {
  return {
    id: Number(row.id), title: String(row.title), slug: String(row.slug),
    description: (row.description as string | null) ?? null,
    postCount: Number(row.post_count ?? 0), commentsEnabled: Boolean(row.comments_enabled), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

export async function listSeries() {
  const rows = await sql`
    select s.*, count(ps.post_id)::int as post_count
    from series s left join post_series ps on ps.series_id = s.id
    group by s.id order by s.updated_at desc, s.id desc
  `;
  return rows.map((row) => normalize(row as Record<string, unknown>));
}

export async function getSeriesById(id: number) {
  const rows = await sql`
    select s.*, count(ps.post_id)::int as post_count
    from series s left join post_series ps on ps.series_id = s.id
    where s.id = ${id} group by s.id limit 1
  `;
  return rows[0] ? normalize(rows[0] as Record<string, unknown>) : null;
}

export async function createSeries(input: { title: string; slug: string; description?: string; commentsEnabled?: boolean }) {
  requireNonEmpty(input.title, "Series title");
  validateSlug(input.slug);
  try {
    const rows = await sql`
      insert into series (title, slug, description, comments_enabled) values (${input.title}, ${input.slug}, ${input.description ?? null}, ${input.commentsEnabled ?? false}) returning id
    `;
    return getSeriesById(Number(rows[0].id));
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new AppValidationError(`Slug "${input.slug}" is already in use.`);
    throw error;
  }
}

export async function updateSeries(id: number, input: { title: string; slug: string; description?: string; commentsEnabled?: boolean }) {
  requireNonEmpty(input.title, "Series title");
  validateSlug(input.slug);
  try {
    await sql`update series set title = ${input.title}, slug = ${input.slug}, description = ${input.description ?? null}, comments_enabled = coalesce(${input.commentsEnabled ?? null}, comments_enabled), updated_at = now() where id = ${id}`;
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new AppValidationError(`Slug "${input.slug}" is already in use.`);
    throw error;
  }
  return getSeriesById(id);
}

export async function deleteSeries(id: number) { await sql`delete from series where id = ${id}`; }

export async function listSeriesPosts(seriesId: number) {
  return sql`
    select p.id, p.title, p.slug, p.status, ps.position
    from post_series ps join posts p on p.id = ps.post_id
    where ps.series_id = ${seriesId} order by ps.position asc, p.id asc
  `;
}

export async function getPostSeriesId(postId: number) {
  const rows = await sql`select series_id from post_series where post_id = ${postId} limit 1`;
  return rows[0] ? Number(rows[0].series_id) : null;
}

export async function listPostSeriesAssignments(postIds: number[]) {
  if (postIds.length === 0) return new Map<number, number>();
  const rows = await sql`select post_id, series_id from post_series where post_id = any(${bigintArray(postIds)})`;
  return new Map(rows.map((row) => [Number(row.post_id), Number(row.series_id)]));
}

export async function listPostSeriesNavigation(postIds: number[]) {
  const navigation = new Map<number, SeriesNavigation>();
  if (postIds.length === 0) return navigation;

  const assignments = await sql`
    select ps.post_id, s.id as series_id, s.title as series_title, s.slug as series_slug
    from post_series ps
    join series s on s.id = ps.series_id
    where ps.post_id = any(${bigintArray(postIds)})
  `;
  if (assignments.length === 0) return navigation;

  const seriesIds = [...new Set(assignments.map((row) => Number(row.series_id)))];
  const members = await sql`
    select ps.series_id, p.id, p.title, p.slug, p.published_at, p.updated_at, ps.position,
      coalesce((
        select json_agg(c.slug order by c.slug)
        from post_categories pc join categories c on c.id = pc.category_id
        where pc.post_id = p.id
      ), '[]'::json) as categories
    from post_series ps
    join posts p on p.id = ps.post_id
    where ps.series_id = any(${bigintArray(seriesIds)})
      and (p.status = 'published' or p.id = any(${bigintArray(postIds)}))
    order by ps.series_id asc, ps.position asc, p.id asc
  `;
  const membersBySeries = new Map<number, SeriesNavigationPost[]>();
  for (const row of members) {
    const seriesId = Number(row.series_id);
    const posts = membersBySeries.get(seriesId) ?? [];
    posts.push({
      id: Number(row.id),
      title: String(row.title),
      slug: String(row.slug),
      position: Number(row.position),
      publishedAt: (row.published_at as string | null) ?? null,
      updatedAt: String(row.updated_at),
      categories: Array.isArray(row.categories) ? row.categories.map(String) : [],
    });
    membersBySeries.set(seriesId, posts);
  }

  for (const row of assignments) {
    const seriesId = Number(row.series_id);
    navigation.set(Number(row.post_id), {
      id: seriesId,
      title: String(row.series_title),
      slug: String(row.series_slug),
      posts: membersBySeries.get(seriesId) ?? [],
    });
  }
  return navigation;
}

export async function getPostSeriesNavigation(postId: number) {
  return (await listPostSeriesNavigation([postId])).get(postId) ?? null;
}

export async function assignPostToSeries(seriesId: number, postId: number, position: number) {
  await sql`
    insert into post_series (post_id, series_id, position) values (${postId}, ${seriesId}, ${Math.max(0, position)})
    on conflict (post_id) do update set series_id = excluded.series_id, position = excluded.position
  `;
  await sql`update series set updated_at = now() where id = ${seriesId}`;
}

export async function removePostFromSeries(postId: number) { await sql`delete from post_series where post_id = ${postId}`; }
