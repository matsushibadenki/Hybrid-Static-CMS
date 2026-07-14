# Operations and Security Notes

## What installers should know

Hybrid-Static-CMS is intended to be generic and open-source friendly, but the operator still needs to make several decisions before going live.

## Current operational expectations

- Operators manage Bun process uptime themselves
- Operators can create PostgreSQL backups with the included CLI, but must choose and verify their own retention and off-site storage policy
- Operators are responsible for reverse proxy TLS and access logs
- Generated CMS artifacts are overwritten during publish/render flows

## Security notes for the current MVP

The current codebase includes:

- HttpOnly cookie sessions
- Password hashing
- Role records in the database
- A narrow admin surface under a configurable path
- Audit log UI for key admin and API actions
- File snapshot create/restore UI for safe text files inside `public_html`
- Diff preview before restoring a snapshot
- Quick snapshot creation from page and post edit screens
- Explicit confirmation step before snapshot restore
- Optional Google reCAPTCHA v3 verification for public form submissions
- CSRF protection for authenticated admin and API mutations
- Media picker buttons in post and page editing for image, video, audio, and PDF snippets
- Revision history for posts and pages, including restore through the normal validation and publishing flow
- Automatic pre-restore snapshots and rollback links for file snapshot restoration
- Basic Body HTML authoring toolbar for common formatting and links
- Canonical URL, OG image, and keyword controls with automatic metadata fallbacks
- Audit log filtering by actor, target text, summary, and exact action
- Dashboard notifications for important authentication, deletion, restore, and revision actions
- A lightweight scheduled job that publishes due content and removes expired sessions and stale login-attempt records
- AI file proposals with protected paths, diff review, approval, rejection, and automatic pre-apply snapshots
- First-run setup wizard at `/setup`, locked automatically after the first administrator is created
- Database-backed login throttling by client IP and email key
- Optional deployment-wide TOTP two-factor login

### PostgreSQL backup and restore

The repository includes portable SQL backup commands. The host running the commands must have the PostgreSQL client tools `pg_dump` and `psql` installed, and `DATABASE_URL` must point to the target database.

Create a backup in the Git-ignored `storage/backups` directory:

```bash
bun run db:backup
```

Choose an explicit output path when needed:

```bash
bun run db:backup -- --output /safe/backup/location/hybrid-static-cms.sql
```

Restore only after confirming the target database and taking a current backup. Restoration can replace tables included in the dump:

```bash
bun run db:restore -- --input /safe/backup/location/hybrid-static-cms.sql --confirm
```

The commands read connection details from `DATABASE_URL` without printing the password. Backup files are created with owner-only permissions and may contain password hashes, user records, and form submissions; store them in protected, encrypted, access-controlled storage. They do not back up `public_html` uploads or hand-edited files; back up those directories separately when the site requires them.

### CSRF behavior

Browser requests from the control panel are protected by same-origin checks. The control panel also exposes the per-session token in its forms for integrations and progressive enhancement, so operators do not need to configure an additional value.

For authenticated JSON API mutations, send the token from the current session in the `X-CSRF-Token` header. Public form submissions under `/cms-api/forms/:slug/submit` remain available to visitors and use the optional reCAPTCHA v3 protection instead.

The current codebase does not yet include:

- encrypted API key storage

For any public deployment, treat the current repository as an MVP foundation rather than a finished hardened CMS.

## Publishing behavior

When a post is created, updated, or deleted:

1. PostgreSQL content is updated
2. Published artifact generation runs
3. Static HTML, RSS, sitemap, robots, llms, and embed outputs are refreshed

This means installation users should know:

- publish operations trigger file writes
- `CMS_OUTPUT_DIR` must be writable
- `CMS_UPLOAD_DIR` must be writable
- artifact collisions should be avoided by reserving the `/cms` namespace
- review generated `robots.txt` and `llms.txt` whenever public access policy changes

## Recommended production checklist

- Change the seeded admin password immediately
- Use a strong `SESSION_SECRET`
- Set `COOKIE_SECURE=true` when serving through HTTPS if automatic detection is not sufficient
- Set `TRUST_PROXY=true` only behind a proxy you control; otherwise forwarded client-IP headers are ignored
- Enable `TWO_FACTOR_ENABLED=true` with a protected Base32 `TWO_FACTOR_SECRET` for an additional login factor
- Configure `RECAPTCHA_SITE_KEY` and `RECAPTCHA_SECRET_KEY` before exposing public forms
- Restrict direct server access
- Put the app behind HTTPS
- Limit database access to the app host
- Monitor app logs and database health
- Back up PostgreSQL and generated uploads
- Confirm `/cms` does not conflict with existing site paths
- Verify `robots.txt` and `llms.txt` match the intended AI access policy

## Suggested next docs to add as the project grows

- upgrade guide
- backup and restore guide
- plugin authoring guide
- theme and template guide
- AI workflow safety guide
