import { sql } from "./db";
import { requireExistingStylesheet } from "./assets";

export type CategoryRecord = {
  id: number;
  name: string;
  slug: string;
  stylesheetPath: string | null;
  postCount: number;
};

function normalizeCategory(row: Record<string, unknown>): CategoryRecord {
  return {
    id: Number(row.id),
    name: String(row.name),
    slug: String(row.slug),
    stylesheetPath: (row.stylesheet_path as string | null) ?? null,
    postCount: Number(row.post_count ?? 0),
  };
}

export async function listCategories() {
  const rows = await sql`
    select c.*, count(pc.post_id)::int as post_count
    from categories c
    left join post_categories pc on pc.category_id = c.id
    group by c.id
    order by c.name asc, c.id asc
  `;
  return rows.map((row) => normalizeCategory(row as Record<string, unknown>));
}

export async function updateCategoryStylesheet(id: number, stylesheetPath: string | null) {
  const normalized = await requireExistingStylesheet(stylesheetPath, "categories");
  await sql`update categories set stylesheet_path = ${normalized} where id = ${id}`;
}

