import { sql } from "./db";

const maxQueryLength = 200;
const maxSearchTokens = 8;

export type SearchContentType = "post" | "page";

export interface SearchResult {
  type: SearchContentType;
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  status: string;
  updatedAt: string;
  score: number;
}

export function normalizeSearchQuery(input: string | null | undefined) {
  const normalized = String(input ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const query = Array.from(normalized).slice(0, maxQueryLength).join("").trim();
  return {
    query,
    tokens: query.split(" ").filter(Boolean).slice(0, maxSearchTokens),
  };
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export function buildSearchCondition(alias: string, input: string, params: Array<string | number>) {
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw new Error("Invalid search table alias.");
  const normalized = normalizeSearchQuery(input);
  if (!normalized.query || normalized.tokens.length === 0) return null;

  const conditions = normalized.tokens.map((token) => {
    params.push(`%${escapeLike(token)}%`);
    return `${alias}.search_text like $${params.length} escape '\\'`;
  });
  const filterParameterCount = params.length;
  params.push(normalized.query);
  const queryParameter = `$${params.length}`;
  const normalizedTitle = `normalize(lower(${alias}.title), NFKC)`;
  const rank = `(
    case when ${normalizedTitle} = ${queryParameter} then 4 else 0 end +
    case when ${normalizedTitle} like '%' || ${queryParameter} || '%' then 2 else 0 end +
    greatest(similarity(${normalizedTitle}, ${queryParameter}), word_similarity(${queryParameter}, ${alias}.search_text))
  )`;

  return { condition: `(${conditions.join(" and ")})`, rank, normalized, filterParameterCount };
}

function normalizeResult(row: Record<string, unknown>): SearchResult {
  return {
    type: row.content_type as SearchContentType,
    id: Number(row.id),
    title: String(row.title),
    slug: String(row.slug),
    excerpt: (row.excerpt as string | null) ?? null,
    status: String(row.status),
    updatedAt: String(row.updated_at),
    score: Number(row.score ?? 0),
  };
}

export async function searchContent(input: string, options: { status?: "published" | "any"; limit?: number } = {}) {
  const params: Array<string | number> = [];
  const filters: string[] = [];
  if ((options.status ?? "published") !== "any") {
    params.push("published");
    filters.push(`c.status = $${params.length}`);
  }
  const search = buildSearchCondition("c", input, params);
  if (!search) return { query: "", total: 0, items: [] as SearchResult[] };
  filters.push(search.condition);
  const limit = Math.max(1, Math.min(100, options.limit ?? 20));
  const contentUnion = `
    select 'post'::text as content_type, id, title, slug, excerpt, status, updated_at, search_text from posts
    union all
    select 'page'::text as content_type, id, title, slug, excerpt, status, updated_at, search_text from pages
  `;
  const [rows, countRows] = await Promise.all([
    sql.unsafe(
    `
      select c.content_type, c.id, c.title, c.slug, c.excerpt, c.status, c.updated_at,
        ${search.rank} as score
      from (${contentUnion}) c
      where ${filters.join(" and ")}
      order by score desc, c.updated_at desc, c.id desc
      limit ${limit}
    `,
    params as any[],
    ),
    sql.unsafe(
      `select count(*)::int as total from (${contentUnion}) c where ${filters.join(" and ")}`,
      params.slice(0, search.filterParameterCount) as any[],
    ),
  ]);
  return { query: search.normalized.query, total: Number(countRows[0]?.total ?? 0), items: rows.map((row) => normalizeResult(row as Record<string, unknown>)) };
}

export async function getSearchDiagnostics() {
  const [extensionRows, countRows, indexRows] = await Promise.all([
    sql`select extversion from pg_extension where extname = 'pg_trgm' limit 1`,
    sql`
      select
        (select count(*)::int from posts) as posts_total,
        (select count(*)::int from posts where search_text <> '') as posts_indexed,
        (select count(*)::int from pages) as pages_total,
        (select count(*)::int from pages where search_text <> '') as pages_indexed
    `,
    sql`
      select c.relname, i.indisvalid, i.indisready
      from pg_class c
      join pg_index i on i.indexrelid = c.oid
      where c.relname in ('posts_search_text_trgm_idx', 'pages_search_text_trgm_idx')
      order by c.relname
    `,
  ]);
  const counts = countRows[0] ?? {};
  const indexes = indexRows.map((row) => ({
    name: String(row.relname),
    healthy: Boolean(row.indisvalid) && Boolean(row.indisready),
  }));
  return {
    extensionVersion: extensionRows[0] ? String(extensionRows[0].extversion) : null,
    posts: { total: Number(counts.posts_total ?? 0), indexed: Number(counts.posts_indexed ?? 0) },
    pages: { total: Number(counts.pages_total ?? 0), indexed: Number(counts.pages_indexed ?? 0) },
    indexes,
    healthy: Boolean(extensionRows[0]) && indexes.length === 2 && indexes.every((index) => index.healthy),
  };
}

export async function rebuildSearchIndexes() {
  await sql.unsafe("reindex index concurrently posts_search_text_trgm_idx");
  await sql.unsafe("reindex index concurrently pages_search_text_trgm_idx");
}
