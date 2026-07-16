import { sql } from "./db";
import { AppValidationError, isUniqueConstraintError, requireNonEmpty, validateSlug } from "./validation";

export type SeriesRecord = {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  postCount: number;
  createdAt: string;
  updatedAt: string;
};

function normalize(row: Record<string, unknown>): SeriesRecord {
  return {
    id: Number(row.id), title: String(row.title), slug: String(row.slug),
    description: (row.description as string | null) ?? null,
    postCount: Number(row.post_count ?? 0), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
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

export async function createSeries(input: { title: string; slug: string; description?: string }) {
  requireNonEmpty(input.title, "Series title");
  validateSlug(input.slug);
  try {
    const rows = await sql`
      insert into series (title, slug, description) values (${input.title}, ${input.slug}, ${input.description ?? null}) returning id
    `;
    return getSeriesById(Number(rows[0].id));
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new AppValidationError(`Slug "${input.slug}" is already in use.`);
    throw error;
  }
}

export async function updateSeries(id: number, input: { title: string; slug: string; description?: string }) {
  requireNonEmpty(input.title, "Series title");
  validateSlug(input.slug);
  try {
    await sql`update series set title = ${input.title}, slug = ${input.slug}, description = ${input.description ?? null}, updated_at = now() where id = ${id}`;
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

export async function assignPostToSeries(seriesId: number, postId: number, position: number) {
  await sql`
    insert into post_series (post_id, series_id, position) values (${postId}, ${seriesId}, ${Math.max(0, position)})
    on conflict (post_id) do update set series_id = excluded.series_id, position = excluded.position
  `;
  await sql`update series set updated_at = now() where id = ${seriesId}`;
}

export async function removePostFromSeries(postId: number) { await sql`delete from post_series where post_id = ${postId}`; }
