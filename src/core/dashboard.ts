import { sql } from "./db";

export async function getDashboardStats() {
  const [posts] = await sql`select count(*)::int as value from posts`;
  const [published] = await sql`select count(*)::int as value from posts where status = 'published'`;
  const [pages] = await sql`select count(*)::int as value from pages`;
  const [media] = await sql`select count(*)::int as value from media_files`;
  const [logs] = await sql`select count(*)::int as value from audit_logs`;
  const [snapshots] = await sql`select count(*)::int as value from file_snapshots`;
  const [users] = await sql`select count(*)::int as value from users`;

  return {
    posts: Number(posts?.value ?? 0),
    published: Number(published?.value ?? 0),
    pages: Number(pages?.value ?? 0),
    media: Number(media?.value ?? 0),
    logs: Number(logs?.value ?? 0),
    snapshots: Number(snapshots?.value ?? 0),
    users: Number(users?.value ?? 0),
  };
}
