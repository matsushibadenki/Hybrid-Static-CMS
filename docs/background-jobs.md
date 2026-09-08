# Background Rendering Jobs

The control-panel **Regenerate public output** action creates a PostgreSQL job instead of keeping the browser request open. Repeated requests coalesce into one active job. The scheduler processes it within one minute, uses row locking for multi-instance safety, and retries failures with exponential backoff up to six attempts.

Run `bun run migrate` through migration `037_background_job_uniqueness.sql`. Failed jobs retain a short error message in the database and emit structured logs. The existing synchronous rendering paths remain available for content saves that require immediate rollback safety.

Different media items can be queued at the same time. Repeated requests for the same queued or running item are coalesced; the scheduler processes one job per invocation.

Administrators can review queued, running, completed, and failed work at `/control-panel/jobs`. The page is read-only and requires the same operational permission as database maintenance.

JPEG, PNG, and WebP items in the media library also have a **Regenerate variants** action. It queues thumbnail, display, WebP, and AVIF regeneration without keeping the control-panel request open. Existing variants remain available if a queued attempt fails.
