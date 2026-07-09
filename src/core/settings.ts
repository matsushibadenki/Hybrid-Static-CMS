import { sql } from "./db";

export async function ensureDefaultSettings() {
  await sql`
    insert into settings (key, value)
    values ('site_tagline', 'A coexistence CMS for existing sites')
    on conflict (key) do nothing
  `;
}
