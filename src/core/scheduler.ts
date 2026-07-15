import { writeAuditLog } from "./audit";
import { sql } from "./db";
import { clearExpiredFormRateLimits } from "./formRateLimit";
import { deleteExpiredFormSubmissions } from "./forms";

export async function runScheduledJobs() {
  const posts = await sql`
    update posts
    set status = 'published', updated_at = now()
    where status = 'scheduled' and published_at is not null and published_at <= now()
    returning id
  `;
  const pages = await sql`
    update pages
    set status = 'published', updated_at = now()
    where status = 'scheduled' and published_at is not null and published_at <= now()
    returning id
  `;

  await sql`delete from sessions where expires_at <= now()`;
  await sql`delete from login_attempts where window_started < now() - interval '1 day'`;
  await clearExpiredFormRateLimits();
  await deleteExpiredFormSubmissions();

  const publishedPosts = posts.length;
  const publishedPages = pages.length;
  if (publishedPosts || publishedPages) {
    await writeAuditLog({
      action: "scheduler.publish",
      targetType: "content",
      summary: `Published ${publishedPosts} scheduled post(s) and ${publishedPages} scheduled page(s).`,
    });
  }

  return { publishedPosts, publishedPages };
}
