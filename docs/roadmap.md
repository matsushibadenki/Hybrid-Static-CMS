# Roadmap

This roadmap tracks what Hybrid-Static-CMS already supports and what is planned next.

## Status legend

- `[Done]` implemented in the current codebase
- `[Next]` high-priority unfinished work
- `[Later]` planned, but not the closest next step

## Current status

Hybrid-Static-CMS has completed its MVP feature set and is moving into production hardening. The coexistence model remains central: existing `public_html` pages can continue working while CMS-managed content is published as static fragments, APIs, or embeds.

## Completed

### Platform and coexistence

- `[Done]` Bun 1.4.0 + Hono application server with matching Docker and CI runtime pins
- `[Done]` TypeScript 7-compatible project configuration
- `[Done]` PostgreSQL 18 persistence, migrations, and seed scripts
- `[Done]` Docker baseline for local and production deployment
- `[Done]` Environment-based configuration and setup wizard
- `[Done]` `public_html` coexistence architecture
- `[Done]` Reverse-proxy-ready control panel under `/control-panel`
- `[Done]` JSON API under `/cms-api/*`
- `[Done]` Generated CMS output under `/cms/*`
- `[Done]` Configurable generated templates through `templates/page.html`
- `[Done]` Google Fonts configuration through `GOOGLE_FONTS_CSS_URLS`
- `[Done]` PostgreSQL-backed public theme settings for colors, typography, spacing, Google Fonts, live preview, generated CSS tokens, and safe regeneration rollback
- `[Done]` Automatic public asset directories for headless frontends and category/fixed-page stylesheet assignment

### Content and editor

- `[Done]` Post CRUD with categories, tags, draft, published, and scheduled states
- `[Done]` Series management with parent series, ordered article assignment, and a section-based collection editor
- `[Done]` Series-aware article pagination with ordered previous, next, and numbered navigation
- `[Done]` Selectable post permalink structures with complete regeneration and safe stale-file cleanup
- `[Done]` Complete control-panel translation coverage for text, form hints, accessibility labels, dynamic counts, and localized dates in English, Japanese, and Simplified Chinese
- `[Done]` Configurable localization of CMS-generated public navigation through `PUBLIC_LOCALE`
- `[Done]` Fixed-page groups with slug-based parents, ordered page assignment, and a section-based collection editor
- `[Done]` CMS-managed page CRUD
- `[Done]` Multiple form generation, visual field builder, management, deletion, and submission capture
- `[Done]` Media library for images, video, audio, PDF, and text files
- `[Done]` Media picker and direct upload from post/page editors
- `[Done]` HTML authoring toolbar for bold, italic, strikethrough, quotes, lists, links, alignment, code, and rules
- `[Done]` H1-H4 headings and article text-size presets
- `[Done]` Semantic ruby annotations
- `[Done]` LaTeX mathematics through MathJax rendering
- `[Done]` Mermaid chart blocks and static-page rendering
- `[Done]` Reusable published blocks with separated identity, body, placement, and publication controls via `[[block:slug]]`
- `[Done]` Managed OpenStreetMap and Google Maps snippets with pinpoint markers, routes, `[[map:slug]]`, public HTML/PHP loaders, and configurable provider services
- `[Done]` CMS-managed navigation menus with a visual link builder
- `[Done]` Post and page revisions with review and restore
- `[Done]` PostgreSQL-backed post/page autosave with per-user crash recovery, conflict warnings, explicit restore/discard controls, and retention cleanup
- `[Done]` Moderated article comments with series-level safety controls, per-post overrides, rate limiting, and reCAPTCHA v3
- `[Done]` Versioned post/page JSON export and safe draft import with slug-conflict protection, parent-slug relationship mapping, permissions, and audit logs

### Publishing and discoverability

- `[Done]` Latest posts, full list, pagination, and per-post static HTML output
- `[Done]` CMS-managed page and form HTML output
- `[Done]` RSS and sitemap output
- `[Done]` `robots.txt` and AI-oriented `llms.txt`
- `[Done]` Client-side `embed.js`
- `[Done]` Canonical URLs, OG images, keywords, indexing controls, and JSON-LD
- `[Done]` Google reCAPTCHA v3 support for public forms
- `[Done]` Magazine-style default static page design
- `[Done]` Redirect manager, automatic old-URL preservation, generated redirect manifest, and privacy-conscious aggregated 404 reporting
- `[Done]` Japanese-aware post/page search with Unicode NFKC normalization, short-term matching, trigram relevance, public API support, index diagnostics, and concurrent rebuild controls

### Security and administration

- `[Done]` Cookie-based authentication and login throttling
- `[Done]` Optional deployment-wide TOTP two-factor authentication
- `[Done]` Personal TOTP enrollment with encrypted secrets, one-time recovery codes, password self-service, and active-session management
- `[Done]` User directory with role assignment, activation, password reset, and session revocation
- `[Done]` Fine-grained permissions for reading, editing, publishing, deleting, restoring, AI, snapshots, and user administration
- `[Done]` CSRF protection for authenticated admin and API mutations
- `[Done]` Strong cookie and proxy-aware security defaults
- `[Done]` Audit logs with text and action filtering
- `[Done]` Operator notifications
- `[Done]` Hidden-dot-path blocking for public static file serving
- `[Done]` AI proposal workflow with approval gates, protected paths, and audit links

### Operations and extensibility

- `[Done]` File snapshots for safe text files inside `public_html`
- `[Done]` Diff preview, explicit restore confirmation, and automatic rollback snapshots
- `[Done]` PostgreSQL backup and restore workflows
- `[Done]` Health and readiness endpoints for PostgreSQL and generated output paths
- `[Done]` Scheduled publishing and housekeeping jobs
- `[Done]` Plugin hooks for rendering and audit events
- `[Done]` Custom API extension points
- `[Done]` Admin menu extension support
- `[Done]` VPS, Docker, upgrade, contributor, and architecture documentation

## Next priority

### Reliability and quality

- `[Done]` Core unit tests for permissions, validation, sanitization, LaTeX, Mermaid, and Ruby formatting
- `[Done]` GitHub Actions CI for TypeScript, Bun tests, and PostgreSQL 18 migration checks
- `[Done]` Application smoke integration tests for liveness and unauthenticated control-panel access
- `[Done]` Authentication and public form submission integration coverage
- `[Done]` Published-post static artifact integration coverage
- `[Done]` Media upload, content-signature, storage, and deletion integration coverage
- `[Done]` PostgreSQL backup-generation integration coverage
- `[Done]` Destructive restore integration tests using an isolated temporary database
- `[Done]` Atomic static artifact publishing with temporary files and rename-on-success
- `[Done]` Scheduled-publishing timezone support, persistent exponential retries, failure notifications, and recovery alerts
- `[Done]` Signed one-hour preview URLs for draft, scheduled, and published posts/pages
- `[Done]` Structured JSON/text application logs with recursive secret redaction, severity filtering, and signed operator-alert webhooks

### Security and media hardening

- `[Done]` File-size limits, site/user storage quotas, per-role upload policies, and control-panel usage reporting
- `[Done]` Per-file upload size limits and opt-in SVG handling
- `[Done]` Media content-signature checks for common image, video, audio, and PDF uploads
- `[Done]` SVG sanitization and removal of scripts, event attributes, and foreign content
- `[Done]` Deeper media-content inspection, canonical MIME-derived extensions, active-PDF rejection, and escaped embed output
- `[Done]` Image metadata extraction, bounded decoding, automatic resizing, WebP/AVIF variants, thumbnails, responsive picture output, and derivative-aware quotas/deletion
- `[Done]` Unused-media detection and a reference-aware cleanup workflow covering CMS content, revisions, generated output, and hand-written public files
- `[Done]` PostgreSQL-backed public form rate limiting by form and trusted client IP
- `[Done]` Configurable form-submission retention cleanup and permission-protected CSV export
- `[Done]` SMTP form submission notifications with operator-visible delivery failures
- `[Done]` Optional profile-based Stalwart Docker mail server with private-relay and explicit public-port deployment modes
- `[Later]` Optional Next.js Route Handler + Nodemailer mail gateway using an external SMTP provider, with signed internal requests, secret rotation, retry handling, and a migration path from the built-in SMTP sender
- `[Later]` Optional Nodemailer `sendmail` transport for VPS installations with a local Sendmail-compatible MTA, including executable-path configuration, least-privilege execution, queue monitoring, and delivery-failure handling
- `[Later]` Configurable mail-delivery strategy for Next.js server-side sending through SMTP, a provider mail API, or local Sendmail, switchable per installation without changing form code

### Editorial workflow

- `[Done]` Editorial review states and approval workflow separate from publication status, with approval fingerprints, role-based review actions, history, audit logs, list filters, and operator notifications
- `[Done]` Post/page import and export for migration and portability
- `[Done]` Redirect manager and 404 report for slug changes and broken links
- `[Done]` Japanese-aware full-text search and search administration tools

## Later roadmap

### Site and theme management

- `[Done]` Theme settings UI for colors, typography, spacing, and Google Fonts
- `[Done]` Theme starter kits and reusable public templates
- `[Done]` Visual layout blocks with responsive previews
- `[Done]` Local font hosting and privacy-first asset mode
- `[Done]` Multi-language post and page content, locale routing, translation metadata, linked draft creation, `hreflang`, localized static output, and locale-filtered public APIs

### API and integrations

- `[Later]` External mail delivery adapter for Next.js Route Handler, Nodemailer, and provider-managed SMTP
- `[Done]` Local Sendmail-compatible MTA adapter with absolute-path, direct-execution, least-privilege deployment guidance, and failure isolation
- `[Done]` Provider-neutral mail delivery strategy for SMTP, HTTP mail APIs, and local MTA selection without changing form code
- `[Done]` Scoped API keys and machine-user authentication with least-privilege scopes, expiration, revocation, audit records, and server-to-server CMS API access
- `[Done]` Signed outbound webhooks for publishing, content, form-submission, media, and backup events with privacy-safe payloads and failure isolation
- `[Later]` OAuth or OIDC login integration
- `[Later]` External object storage adapters such as S3-compatible storage
- `[Later]` Search adapters for larger installations

### Operations at scale

- `[Done]` PostgreSQL advisory scheduler locks for multi-instance deployments, with safe skip behavior and configurable site-scoped lock names
- `[Done]` PostgreSQL-backed, coalesced public-artifact rendering queue with row locking, retry backoff, and scheduler processing
- `[Later]` Queue-backed media derivative processing
- `[Done]` Automated PostgreSQL SQL backup rotation, optional rclone off-site copies, and rollback-only restore drills against an explicitly separate database
- `[Done]` Privacy-safe hourly operational metrics dashboard for publishing, public traffic/status trends, forms, media, backups, and errors
- `[Done]` PostgreSQL health dashboard, active slow-query and transaction diagnostics, table statistics, safe ANALYZE operation, and configurable audit/notification retention

## Priority order

1. `[Done]` Tests, CI, and permission regression coverage
2. `[Done]` Atomic publishing, preview, health checks, and structured alerts
3. `[Done]` Media and upload security hardening
4. `[Done]` Editorial review states and approval workflow
5. `[Done]` Japanese-aware full-text search and search administration
6. `[Done]` Theme settings UI for colors, typography, spacing, and Google Fonts
7. `[Done]` Theme starter kits and reusable public templates
8. `[Done]` Visual layout blocks with responsive previews
9. `[Done]` Local font hosting and privacy-first asset mode
10. `[Done]` Multi-language content, locale routing, and translation metadata
11. `[Next]` Integrations and scale-out operations

## Notes for contributors

- roadmap items are directional, not contractual
- existing `public_html` sites must keep working without a full CMS takeover
- safety, data portability, and backward-compatible migrations take priority over convenience
- every completed item should include documentation and an appropriate verification path
