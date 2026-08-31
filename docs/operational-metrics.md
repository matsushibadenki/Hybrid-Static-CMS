# Operational Metrics

## Overview

**Operations → Operational metrics** shows hourly aggregate counts for public
requests, public 4xx and 5xx responses, completed static regenerations, form
submissions, media changes, and completed database backups.

The dashboard offers 24-hour, 7-day, and 30-day views. It is available only to
owners and administrators.

## Privacy model

Metrics store only an hourly timestamp, a fixed metric name, and a count. They
do not store IP addresses, cookies, account identifiers, full URLs, query
strings, search terms, referrers, form fields, email addresses, or article
content. They are operational trends, not an analytics or visitor-tracking
system.

## Retention

```env
METRICS_RETENTION_DAYS=90
```

The default is 90 days. Set `0` to retain hourly metrics indefinitely. Scheduled
housekeeping removes older buckets when retention is enabled. Database backups
may retain metrics separately.

## Interpretation

- Rising `Public 5xx responses` should be investigated through structured logs,
  health checks, and operator alerts.
- A high number of `Public regenerations` can indicate frequent editorial work,
  an integration loop, or an overly aggressive deployment trigger.
- Form and media counts measure successful CMS operations, not every browser
  attempt.

The dashboard does not expose query text or request paths. Use PostgreSQL and
application observability tooling for detailed incident diagnosis.
