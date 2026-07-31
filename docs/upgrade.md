# Upgrade Guide

1. Read the release notes and inspect the migration files added since the current version.
2. Back up PostgreSQL with `bun run db:backup`.
3. Back up `public_html`, `storage/uploads`, `templates`, `plugins`, and `.env` using protected storage.
4. Stop the running application or deploy a new application directory beside the old one.
5. Install the locked dependencies with `bun install --frozen-lockfile`.
6. Run `bun run migrate` before starting the new version.
7. Start the application and verify the control panel, generated artifacts, forms, media, and scheduled publishing.
8. Keep the previous application directory until the rollback window has passed.

Never edit an already-applied migration. Add a new numbered SQL migration for schema changes. A database restore should be followed by `bun run migrate` and an artifact regeneration check.

Migration `016_user_management.sql` adds account activation state, last-login tracking, and password-change tracking. Existing users remain active and keep their current roles after migration.

Migration `020_content_constraints.sql` adds database-level checks for post, page, and form statuses and form field types. Before adding the constraints, unsupported legacy values are normalized to `draft` or `text`. Review any custom status or field-type extensions before upgrading.

Migration `022_scheduled_publishing_retries.sql` adds persistent retry metadata for scheduled posts and pages. Add `SCHEDULE_TIME_ZONE` to `.env` after migration. Existing PostgreSQL timestamps remain unchanged.

Structured logging and operator alerts do not require a database migration. Add
the `LOG_*` and `OPERATOR_ALERT_*` variables from `.env.example`; installations
that omit the webhook URL continue using local operator notifications only.

Media upload quotas do not require a database migration. Add the `MEDIA_*`
variables from `.env.example` and restart the application. Their default values
keep storage quotas unlimited while preserving the existing upload roles.

Deeper media inspection does not require a database migration. New uploads use
canonical MIME-derived extensions and stricter container checks. Existing media
URLs are left unchanged to avoid breaking generated or hand-written references;
review legacy uploads separately when they came from untrusted users.

Migration `023_media_image_variants.sql` adds image dimensions, safe metadata,
and derivative-file records. Run `bun install --frozen-lockfile` before the
migration so the locked Sharp/libvips package is present. Existing images remain
valid but do not receive variants automatically; re-upload them if derivatives
are required. Back up the complete upload directory because database backups
contain variant metadata but not image files.

Migration `024_content_stylesheets.sql` adds stylesheet selections to categories
and fixed pages. On startup, the application creates `public_html/assets` and
its `css`, `img`, `js`, and `video` structure without overwriting existing
files. Back up `public_html/assets` separately because PostgreSQL stores only
the selected relative CSS paths.

## PostgreSQL 17 to 18

New deployments use PostgreSQL 18. Do not attach a PostgreSQL 17 data volume directly to the PostgreSQL 18 container. Create a logical backup with `bun run db:backup`, start PostgreSQL 18 with a new volume, restore the backup, and then run `bun run migrate`.

The official PostgreSQL 18 Docker image uses a version-specific data directory under `/var/lib/postgresql`. The repository Compose files use the PostgreSQL 18 volume layout. Existing installations should verify their volume mapping before changing the image tag.
