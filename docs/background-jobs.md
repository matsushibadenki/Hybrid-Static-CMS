# Background Rendering Jobs

The control-panel **Regenerate public output** action creates a PostgreSQL job instead of keeping the browser request open. Repeated requests coalesce into one active job. The scheduler processes it within one minute, uses row locking for multi-instance safety, and retries failures with exponential backoff up to six attempts.

Run `bun run migrate` for migration `035_background_jobs.sql`. Failed jobs retain a short error message in the database and emit structured logs. The existing synchronous rendering paths remain available for content saves that require immediate rollback safety.
