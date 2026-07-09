# Operations and Security Notes

## What installers should know

Hybrid-Static-CMS is intended to be generic and open-source friendly, but the operator still needs to make several decisions before going live.

## Current operational expectations

- Operators manage Bun process uptime themselves
- Operators manage PostgreSQL backups themselves
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

The current codebase does not yet include:

- CSRF protection
- 2FA
- brute-force login throttling
- encrypted API key storage
- file snapshot rollback

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
