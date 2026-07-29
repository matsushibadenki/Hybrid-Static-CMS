import { sql } from "./db";
import { isPostPermalinkPattern, type PostPermalinkPattern } from "./permalinks";

const postPermalinkSettingKey = "post_permalink_pattern";

export async function ensureDefaultSettings() {
  await sql`
    insert into settings (key, value)
    values
      ('site_tagline', 'A coexistence CMS for existing sites'),
      (${postPermalinkSettingKey}, 'post_name')
    on conflict (key) do nothing
  `;
}

export async function getSetting(key: string) {
  const rows = await sql`select value from settings where key = ${key} limit 1`;
  return rows[0] ? String(rows[0].value) : null;
}

export async function setSetting(key: string, value: string) {
  await sql`
    insert into settings (key, value) values (${key}, ${value})
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
}

export async function getPostPermalinkPattern(): Promise<PostPermalinkPattern> {
  const value = await getSetting(postPermalinkSettingKey);
  return value && isPostPermalinkPattern(value) ? value : "post_name";
}

export async function setPostPermalinkPattern(pattern: PostPermalinkPattern) {
  await setSetting(postPermalinkSettingKey, pattern);
}
