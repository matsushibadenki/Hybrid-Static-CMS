# Scheduled Publishing

Hybrid-Static-CMS stores publication timestamps as UTC in PostgreSQL. Editors enter scheduled dates in the installation timezone configured by `SCHEDULE_TIME_ZONE`.

## Timezone

Set an IANA timezone name in `.env`:

```env
SCHEDULE_TIME_ZONE=Asia/Tokyo
```

`UTC` is the default and the safe fallback when the configured value is invalid. The post and fixed-page editors show the active timezone beside the publication field. API clients may send either:

- a local `YYYY-MM-DDTHH:mm` value interpreted in `SCHEDULE_TIME_ZONE`
- an ISO 8601 value containing `Z` or an explicit offset

Local times that do not exist because of a daylight-saving transition are rejected instead of being silently moved. Ambiguous local times during the repeated autumn hour should be sent through the API with an explicit offset when exact selection matters.

Changing `SCHEDULE_TIME_ZONE` does not alter timestamps already stored in PostgreSQL. It only changes how existing timestamps are displayed and how new timezone-less values are interpreted.

## Publication and retries

The scheduler checks once per minute. For due posts and fixed pages it:

1. marks the selected content as published
2. regenerates public artifacts
3. clears previous retry information after successful generation

If artifact generation fails, the affected content is returned to `scheduled`. PostgreSQL records the attempt count, last error, and next retry time. Retry delays increase from one minute to a maximum of one hour.

Each failed attempt creates an operator notification and an audit entry. When a later attempt succeeds, the control panel receives a recovery notification. This prevents the database from reporting a scheduled item as successfully published while its public artifact is known to be stale.

Restarting the Bun process does not lose retry state because it is stored in PostgreSQL.

## Multiple application instances

When two or more Hybrid-Static-CMS application containers share one PostgreSQL database, scheduled publishing and housekeeping must run only once per interval. The scheduler uses a PostgreSQL session advisory lock before beginning work. An instance that cannot acquire the lock records `scheduler.lock_unavailable` and skips that interval; it does not report an error or retry concurrently.

The default settings are:

```env
SCHEDULER_LOCK_ENABLED=true
SCHEDULER_LOCK_NAME=hybrid-static-cms:scheduler
```

Keep the same `SCHEDULER_LOCK_NAME` on every application instance that serves one site. Use a different name only for an intentionally separate site sharing the same PostgreSQL database. Set `SCHEDULER_LOCK_ENABLED=false` only when a single, externally managed scheduler is guaranteed; disabling it on a multi-instance deployment can produce duplicate rendering and housekeeping work.

## Upgrade

Existing installations must run:

```bash
bun run migrate
```

Migration `022_scheduled_publishing_retries.sql` adds retry metadata and partial indexes. Existing scheduled timestamps are not modified.

After upgrading:

1. add `SCHEDULE_TIME_ZONE` to `.env`
2. restart the Bun application
3. open a scheduled post and confirm the displayed local time
4. test a short scheduled publication and verify its generated page
