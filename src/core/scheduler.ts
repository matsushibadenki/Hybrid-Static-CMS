import { writeAuditLog } from "./audit";
import { bigintArray, sql } from "./db";
import { clearExpiredFormRateLimits } from "./formRateLimit";
import { deleteExpiredFormSubmissions } from "./forms";
import { createOperatorNotification } from "./notifications";
import { renderPublishedArtifacts } from "./renderer";
import { logInfo } from "./logger";
import { deleteExpiredEditorAutosaves } from "./autosaves";
import { enableAutomaticRedirectsForPublishedContent } from "./redirects";
import { getPostPermalinkPattern } from "./settings";

type ScheduledItem = { id: number; attempts: number };

async function dueItems(table: "posts" | "pages") {
  const rows = await sql.unsafe(`
    select id, scheduled_publish_attempts
    from ${table}
    where status = 'scheduled'
      and published_at is not null
      and published_at <= now()
      and (scheduled_publish_next_retry_at is null or scheduled_publish_next_retry_at <= now())
    order by published_at, id
    limit 100
  `);
  return rows.map((row) => ({ id: Number(row.id), attempts: Number(row.scheduled_publish_attempts ?? 0) })) as ScheduledItem[];
}

async function markPublishing(table: "posts" | "pages", items: ScheduledItem[]) {
  if (items.length === 0) return;
  await sql.unsafe(
    `update ${table} set status = 'published', updated_at = now() where status = 'scheduled' and id = any($1)`,
    [bigintArray(items.map((item) => item.id))],
  );
}

async function markSucceeded(table: "posts" | "pages", items: ScheduledItem[]) {
  if (items.length === 0) return;
  await sql.unsafe(
    `update ${table}
     set scheduled_publish_attempts = 0,
         scheduled_publish_next_retry_at = null,
         scheduled_publish_last_error = null
     where id = any($1)`,
    [bigintArray(items.map((item) => item.id))],
  );
}

async function markFailed(table: "posts" | "pages", items: ScheduledItem[], message: string) {
  if (items.length === 0) return;
  await sql.unsafe(
    `update ${table}
     set status = 'scheduled',
         scheduled_publish_attempts = scheduled_publish_attempts + 1,
         scheduled_publish_next_retry_at = now() + make_interval(
           secs => least(3600, (60 * power(2, least(scheduled_publish_attempts, 6)))::integer)
         ),
         scheduled_publish_last_error = $2,
         updated_at = now()
     where status = 'published' and id = any($1)`,
    [bigintArray(items.map((item) => item.id)), message.slice(0, 1000)],
  );
}

async function runHousekeeping() {
  const results = await Promise.allSettled([
    sql`delete from sessions where expires_at <= now()`,
    sql`delete from login_attempts where window_started < now() - interval '1 day'`,
    clearExpiredFormRateLimits(),
    deleteExpiredFormSubmissions(),
    deleteExpiredEditorAutosaves(),
  ]);
  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length > 0) {
    await createOperatorNotification({
      level: "warning",
      action: "scheduler.housekeeping_failed",
      message: `${failures.length} scheduled housekeeping task(s) failed. Check the application logs.`,
    }).catch(() => undefined);
  }
}

export async function runScheduledJobs(renderer: () => Promise<unknown> = renderPublishedArtifacts) {
  const [posts, pages] = await Promise.all([dueItems("posts"), dueItems("pages")]);
  const publishedPosts = posts.length;
  const publishedPages = pages.length;
  const wasRetry = [...posts, ...pages].some((item) => item.attempts > 0);

  if (publishedPosts || publishedPages) {
    try {
      await Promise.all([markPublishing("posts", posts), markPublishing("pages", pages)]);
      await renderer();
      await enableAutomaticRedirectsForPublishedContent(posts.map((item) => item.id), pages.map((item) => item.id), await getPostPermalinkPattern());
      await Promise.all([markSucceeded("posts", posts), markSucceeded("pages", pages)]);
      await writeAuditLog({
        action: "scheduler.publish",
        targetType: "content",
        summary: `Published ${publishedPosts} scheduled post(s) and ${publishedPages} scheduled page(s)${wasRetry ? " after retry" : ""}.`,
      });
      logInfo("scheduler.publish", "Scheduled content was published.", {
        publishedPosts,
        publishedPages,
        recoveredAfterRetry: wasRetry,
      });
      if (wasRetry) {
        await createOperatorNotification({
          level: "success",
          action: "scheduler.publish_recovered",
          message: `Scheduled publishing recovered and published ${publishedPosts + publishedPages} item(s).`,
        }).catch(() => undefined);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown scheduled publishing error";
      await Promise.all([markFailed("posts", posts, message), markFailed("pages", pages, message)]);
      await writeAuditLog({
        action: "scheduler.publish_failed",
        targetType: "content",
        summary: `Scheduled publishing failed for ${publishedPosts} post(s) and ${publishedPages} page(s); retry has been queued.`,
      }).catch(() => undefined);
      await createOperatorNotification({
        level: "error",
        action: "scheduler.publish_failed",
        message: `Scheduled publishing failed and will retry automatically: ${message.slice(0, 240)}`,
      }).catch(() => undefined);
      await runHousekeeping();
      return { publishedPosts: 0, publishedPages: 0, failedPosts: publishedPosts, failedPages: publishedPages, retryQueued: true };
    }
  }

  await runHousekeeping();
  return { publishedPosts, publishedPages, failedPosts: 0, failedPages: 0, retryQueued: false };
}
