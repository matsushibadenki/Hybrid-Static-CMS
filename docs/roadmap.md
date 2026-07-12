# Roadmap

This roadmap tracks what Hybrid-Static-CMS already supports and what is still ahead.

## Status legend

- `[Done]` implemented in the current codebase
- `[Next]` high-priority unfinished work
- `[Later]` planned, but not the closest next step

## Current status

Hybrid-Static-CMS is in an MVP-to-operations expansion phase.

The core coexistence model is already working:

- existing `public_html` pages can remain in place
- CMS content can be exposed through static fragments, JSON APIs, and `embed.js`
- operators can manage posts, pages, forms, media, logs, and file snapshots from the control panel

## Completed

### Platform foundation

- `[Done]` Bun + Hono application server
- `[Done]` TypeScript 7-compatible project configuration
- `[Done]` PostgreSQL-backed persistence layer
- `[Done]` Docker baseline for local and team setup
- `[Done]` environment-based configuration
- `[Done]` migration and seed scripts

### Coexistence CMS model

- `[Done]` `public_html` coexistence architecture
- `[Done]` reverse-proxy-ready control panel under `/control-panel`
- `[Done]` JSON API under `/cms-api/*`
- `[Done]` generated output under `/cms/*`
- `[Done]` static publishing flow that regenerates fragments on content changes

### Content management

- `[Done]` post CRUD
- `[Done]` category and tag assignment for posts
- `[Done]` page CRUD
- `[Done]` multiple form generation, management, deletion, and submission capture
- `[Done]` published/draft/scheduled status fields
- `[Done]` media upload and media library management
- `[Done]` post and page media helpers for image, video, audio, and PDF embeds
- `[Done]` SEO title and SEO description fields
- `[Done]` per-entry `noindex` and `nofollow` controls
- `[Done]` Google reCAPTCHA v3 support for public form submissions via `.env`

### Publishing outputs

- `[Done]` latest posts fragment
- `[Done]` full post list fragment
- `[Done]` per-post static HTML pages
- `[Done]` paginated post list pages
- `[Done]` CMS-managed page HTML output
- `[Done]` CMS-managed form HTML output
- `[Done]` RSS output
- `[Done]` sitemap output
- `[Done]` robots.txt output
- `[Done]` AI-oriented `llms.txt` output
- `[Done]` client-side `embed.js`

### Admin and operations

- `[Done]` cookie-based authentication
- `[Done]` role-aware admin access checks
- `[Done]` audit logs for auth, publishing, media, regeneration, form blocking, and snapshots
- `[Done]` admin search and filtering for posts, pages, and forms
- `[Done]` validation feedback for slugs, publish state, and duplicate content in the admin UI
- `[Done]` file snapshots for safe text-based files inside `public_html`
- `[Done]` diff preview before snapshot restore
- `[Done]` explicit confirmation step before snapshot restore
- `[Done]` quick snapshot creation from post and page edit screens
- `[Done]` restore success and error feedback in the UI
- `[Done]` hidden-dot-path blocking for public static file serving

## Unfinished

### Next priority

#### Content safety and workflow

- `[Next]` revisions for posts and pages
- `[Next]` automatic snapshot creation before restore
- `[Next]` snapshot restore rollback flow
- `[Next]` PostgreSQL data backup and restore workflows
- `[Next]` better diff visualization for long files

#### Editor usability

- `[Next]` media picker inside post and page editing
- `[Next]` richer content editing experience

#### Security hardening

- `[Next]` CSRF protection
- `[Next]` login throttling
- `[Next]` optional two-factor authentication
- `[Next]` stronger cookie and proxy-aware security defaults

### Later roadmap

#### Site-building capabilities

- `[Later]` CMS-managed menus
- `[Later]` reusable page sections or blocks
- `[Later]` theme/template override model
- `[Later]` configurable generated output templates

#### SEO and discoverability

- `[Later]` stronger SEO optimization workflows for posts and pages beyond the current canonical, structured-data, sitemap, robots, indexing, and AI discovery controls
- `[Later]` automated meta and structured-data assistance
- `[Later]` richer sitemap, canonical, and indexing controls

#### Operational depth

- `[Later]` audit log filtering
- `[Later]` operator notifications for important actions
- `[Later]` background jobs for scheduled publishing and housekeeping

#### Extensibility

- `[Later]` plugin hook system
- `[Later]` custom API extension points
- `[Later]` admin menu extension support

#### AI-assisted workflows

- `[Later]` proposal-based AI edits for `public_html`
- `[Later]` diff review before AI changes are applied
- `[Later]` protected path rules for AI actions
- `[Later]` AI action logging linked to snapshots and audit logs

#### Open-source distribution maturity

- `[Later]` polished VPS deployment guide
- `[Later]` production-ready Docker deployment profile
- `[Later]` upgrade guide between schema versions
- `[Later]` contributor guide and architectural decision records

## Notes for contributors

- roadmap items are directional, not contractual
- features should preserve the main coexistence principle:
  existing sites must keep working without forcing a full CMS takeover
- safety features should be prioritized over convenience when file writes are involved
