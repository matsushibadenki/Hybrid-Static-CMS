# Database Health and Retention

## Control panel

Owners and administrators can open **Operations → Database health** to review
PostgreSQL capacity and activity without exposing SQL text, form data, user
email addresses, or connection credentials. The page reports database size,
active connections, active queries exceeding the configured threshold, the
longest current transaction, and PostgreSQL table-statistics estimates.

Use **Run ANALYZE** after large imports, deletes, or unusual table growth. It
refreshes planner statistics and does not change CMS content. Schedule VACUUM
and storage maintenance through the database platform or a qualified operator,
especially for large installations.

## Configuration

```env
DATABASE_AUDIT_LOG_RETENTION_DAYS=365
DATABASE_READ_NOTIFICATION_RETENTION_DAYS=90
DATABASE_SLOW_QUERY_SECONDS=30
```

- `DATABASE_AUDIT_LOG_RETENTION_DAYS`: removes audit records older than this
  number of days during scheduled housekeeping. `0` disables deletion.
- `DATABASE_READ_NOTIFICATION_RETENTION_DAYS`: removes only read operator
  notifications older than this number of days. `0` disables deletion.
- `DATABASE_SLOW_QUERY_SECONDS`: active queries running longer than this number
  of seconds are counted on the health page. It does not retain query text.

The default for both deletion settings is `0`. Choose a retention policy that
matches security, legal, and incident-response requirements before enabling
automatic deletion. Database backups and external log collectors may retain
data independently.

## Housekeeping and verification

Scheduled housekeeping already removes expired sessions, stale login attempts,
form rate-limit rows, expired editor autosaves, and optional form submissions.
The new audit-log and read-notification retention rules run in the same job.

After changing `.env`, restart the application, open **Database health**, and
confirm the retention values. Create a non-production audit record, run the
scheduled job or wait for its normal interval, and verify deletion only after
the selected retention age has elapsed.
