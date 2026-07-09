# Roadmap

This roadmap tracks what Hybrid-Static-CMS already supports and what is planned next.

## Current status

Hybrid-Static-CMS is currently in an MVP stage.

The core coexistence model is already working:

- existing `public_html` pages can remain in place
- CMS content can be exposed through static fragments, JSON APIs, and `embed.js`
- operators can manage posts, pages, media, logs, and file snapshots from the control panel

## Implemented

### Platform foundation

- Bun + Hono application server
- PostgreSQL-backed persistence layer
- Docker baseline for local and team setup
- environment-based configuration
- migration and seed scripts

### Coexistence CMS model

- `public_html` coexistence architecture
- reverse-proxy-ready control panel under `/control-panel`
- JSON API under `/cms-api/*`
- generated output under `/cms/*`
- static publishing flow that regenerates fragments on content changes

### Content management

- post CRUD
- category and tag assignment for posts
- page CRUD
- form generation, management, deletion, and submission capture
- published/draft/scheduled status fields
- SEO title and SEO description fields
- per-entry `noindex` and `nofollow` controls

### Publishing outputs

- latest posts fragment
- full post list fragment
- paginated post list pages
- CMS-managed page HTML output
- RSS output
- sitemap output
- robots.txt output
- AI-oriented `llms.txt` output
- client-side `embed.js`

### Admin and operations

- cookie-based authentication
- role-aware admin access checks
- media upload and media library management
- post and page media helpers for image, video, audio, and PDF embeds
- audit logs for auth, publishing, media, regeneration, and snapshots
- file snapshots for safe text-based files inside `public_html`
- diff preview before snapshot restore
- explicit confirmation step before snapshot restore
- quick snapshot creation from post and page edit screens

## Short-term roadmap

These items are the most natural next steps from the current implementation.

### Content safety and workflow

- revisions for posts and pages
- automatic snapshot creation before restore
- snapshot restore rollback flow
- PostgreSQL data backup and restore workflows
- better diff visualization for long files
- restore success and error feedback in the UI

### Editor usability

- media picker inside post and page editing
- richer content editing experience
- better search and filtering in admin lists
- validation feedback for slugs, publish state, and duplicate content

### Security hardening

- CSRF protection
- login throttling
- optional two-factor authentication
- stronger cookie and proxy-aware security defaults

## Mid-term roadmap

### Site-building capabilities

- CMS-managed menus
- multiple embeddable forms for inquiry, lead capture, and custom input flows
- reusable page sections or blocks
- theme/template override model
- configurable generated output templates

### SEO and discoverability

- stronger SEO optimization workflows for posts and pages beyond the current canonical, structured-data, sitemap, robots, and indexing controls
- automated meta and structured-data assistance
- richer sitemap, canonical, and indexing controls

### Operational depth

- backup and restore workflows
- audit log filtering
- operator notifications for important actions
- background jobs for scheduled publishing and housekeeping

### Extensibility

- plugin hook system
- custom API extension points
- admin menu extension support

## Long-term roadmap

### AI-assisted workflows

- proposal-based AI edits for `public_html`
- diff review before AI changes are applied
- protected path rules for AI actions
- AI action logging linked to snapshots and audit logs

### Open-source distribution maturity

- polished VPS deployment guide
- production-ready Docker deployment profile
- upgrade guide between schema versions
- contributor guide and architectural decision records

## Notes for contributors

- roadmap items are directional, not contractual
- features should preserve the main coexistence principle:
  existing sites must keep working without forcing a full CMS takeover
- safety features should be prioritized over convenience when file writes are involved
