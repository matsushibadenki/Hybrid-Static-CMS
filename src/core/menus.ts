import path from "node:path";
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { config } from "./config";
import { escapeHtml } from "./content";
import { sql, withTransaction } from "./db";
import { AppValidationError, isUniqueConstraintError, requireNonEmpty, validateSlug } from "./validation";

export type MenuItemInput = {
  label: string;
  url: string;
  openNewTab?: boolean;
};

export type MenuItemRecord = MenuItemInput & { id: number; sortOrder: number };

export type MenuRecord = {
  id: number;
  title: string;
  slug: string;
  status: "draft" | "published";
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
  items: MenuItemRecord[];
};

function validateUrl(url: string) {
  const value = url.trim();
  if (!value || /^javascript:/i.test(value) || /^data:/i.test(value)) {
    throw new AppValidationError(`Menu URL "${url}" is not allowed.`);
  }
  return value;
}

function normalizeItem(row: Record<string, unknown>): MenuItemRecord {
  return {
    id: Number(row.id),
    label: String(row.label),
    url: String(row.url),
    openNewTab: Boolean(row.open_new_tab),
    sortOrder: Number(row.sort_order),
  };
}

function normalizeMenu(row: Record<string, unknown>, items: MenuItemRecord[]): MenuRecord {
  return {
    id: Number(row.id),
    title: String(row.title),
    slug: String(row.slug),
    status: row.status as MenuRecord["status"],
    createdBy: row.created_by ? Number(row.created_by) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    items,
  };
}

async function getItems(menuId: number) {
  const rows = await sql`
    select id, label, url, open_new_tab, sort_order
    from menu_items
    where menu_id = ${menuId}
    order by sort_order asc, id asc
  `;
  return rows.map((row) => normalizeItem(row as Record<string, unknown>));
}

function validateMenuInput(input: { title: string; slug: string; items: MenuItemInput[] }) {
  requireNonEmpty(input.title, "Title");
  validateSlug(input.slug);
  if (input.items.length === 0) {
    throw new AppValidationError("At least one menu item is required.");
  }
  input.items.forEach((item) => {
    requireNonEmpty(item.label, "Menu item label");
    validateUrl(item.url);
  });
}

export async function listMenus(status: "draft" | "published" | "any" = "any") {
  const rows = status === "any"
    ? await sql`select * from menus order by updated_at desc, id desc`
    : await sql`select * from menus where status = ${status} order by updated_at desc, id desc`;
  const menus: MenuRecord[] = [];
  for (const row of rows) {
    menus.push(normalizeMenu(row as Record<string, unknown>, await getItems(Number(row.id))));
  }
  return menus;
}

export async function getMenuById(id: number) {
  const rows = await sql`select * from menus where id = ${id} limit 1`;
  if (!rows[0]) return null;
  return normalizeMenu(rows[0] as Record<string, unknown>, await getItems(id));
}

export async function getMenuBySlug(slug: string, status: "draft" | "published" | "any" = "published") {
  const rows = status === "any"
    ? await sql`select * from menus where slug = ${slug} limit 1`
    : await sql`select * from menus where slug = ${slug} and status = ${status} limit 1`;
  if (!rows[0]) return null;
  return normalizeMenu(rows[0] as Record<string, unknown>, await getItems(Number(rows[0].id)));
}

async function syncItems(menuId: number, items: MenuItemInput[], trx: typeof sql) {
  await trx`delete from menu_items where menu_id = ${menuId}`;
  for (const [index, item] of items.entries()) {
    await trx`
      insert into menu_items (menu_id, label, url, open_new_tab, sort_order)
      values (${menuId}, ${item.label.trim()}, ${validateUrl(item.url)}, ${Boolean(item.openNewTab)}, ${index})
    `;
  }
}

export async function createMenu(input: { title: string; slug: string; status: "draft" | "published"; items: MenuItemInput[] }, createdBy: number) {
  validateMenuInput(input);
  try {
    const id = await withTransaction(async (trx) => {
      const rows = await trx`
        insert into menus (title, slug, status, created_by)
        values (${input.title.trim()}, ${input.slug}, ${input.status}, ${createdBy})
        returning id
      `;
      const menuId = Number(rows[0].id);
      await syncItems(menuId, input.items, trx as typeof sql);
      return menuId;
    });
    return getMenuById(id);
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new AppValidationError(`Slug "${input.slug}" is already in use.`);
    throw error;
  }
}

export async function updateMenu(id: number, input: { title: string; slug: string; status: "draft" | "published"; items: MenuItemInput[] }) {
  validateMenuInput(input);
  try {
    await withTransaction(async (trx) => {
      await trx`
        update menus
        set title = ${input.title.trim()}, slug = ${input.slug}, status = ${input.status}, updated_at = now()
        where id = ${id}
      `;
      await syncItems(id, input.items, trx as typeof sql);
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new AppValidationError(`Slug "${input.slug}" is already in use.`);
    throw error;
  }
  return getMenuById(id);
}

export async function deleteMenu(id: number) {
  await sql`delete from menus where id = ${id}`;
}

export function renderMenuHtml(menu: MenuRecord) {
  const items = menu.items.map((item) => {
    const target = item.openNewTab ? ` target="_blank" rel="noopener noreferrer"` : "";
    return `<li><a href="${escapeHtml(item.url)}"${target}>${escapeHtml(item.label)}</a></li>`;
  }).join("\n");
  return `<nav class="hybrid-static-cms-menu" aria-label="${escapeHtml(menu.title)}"><ul>\n${items}\n</ul></nav>`;
}

export async function renderMenuArtifacts() {
  const menus = await listMenus("published");
  const outputDir = path.join(config.cmsOutputDir, "menus");
  await mkdir(outputDir, { recursive: true });
  const expected = new Set(menus.map((menu) => `${menu.slug}.html`));
  for (const file of await readdir(outputDir)) {
    if (file.endsWith(".html") && !expected.has(file)) {
      await unlink(path.join(outputDir, file)).catch(() => undefined);
    }
  }
  for (const menu of menus) {
    await writeFile(path.join(outputDir, `${menu.slug}.html`), renderMenuHtml(menu), "utf8");
  }
}
