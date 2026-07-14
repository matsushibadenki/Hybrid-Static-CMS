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

- `[Done]` Bun + Hono application server
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

### Content and editor

- `[Done]` Post CRUD with categories, tags, draft, published, and scheduled states
- `[Done]` CMS-managed page CRUD
- `[Done]` Multiple form generation, management, deletion, and submission capture
- `[Done]` Media library for images, video, audio, PDF, and text files
- `[Done]` Media picker and direct upload from post/page editors
- `[Done]` HTML authoring toolbar for bold, italic, strikethrough, quotes, lists, links, alignment, code, and rules
- `[Done]` H1-H4 headings and article text-size presets
- `[Done]` Semantic ruby annotations
- `[Done]` LaTeX mathematics through MathJax rendering
- `[Done]` Mermaid chart blocks and static-page rendering
- `[Done]` Reusable published blocks via `[[block:slug]]`
- `[Done]` CMS-managed navigation menus
- `[Done]` Post and page revisions with review and restore

### Publishing and discoverability

- `[Done]` Latest posts, full list, pagination, and per-post static HTML output
- `[Done]` CMS-managed page and form HTML output
- `[Done]` RSS and sitemap output
- `[Done]` `robots.txt` and AI-oriented `llms.txt`
- `[Done]` Client-side `embed.js`
- `[Done]` Canonical URLs, OG images, keywords, indexing controls, and JSON-LD
- `[Done]` Google reCAPTCHA v3 support for public forms
- `[Done]` Magazine-style default static page design

### Security and administration

- `[Done]` Cookie-based authentication and login throttling
- `[Done]` Optional deployment-wide TOTP two-factor authentication
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

- `[Next]` Automated unit and integration tests for authentication, permissions, publishing, sanitization, forms, media, backup, and restore
- `[Next]` GitHub Actions CI for TypeScript, tests, migration checks, and security checks
- `[Done]` Atomic static artifact publishing with temporary files and rename-on-success
- `[Next]` Publish preview URLs, scheduled-publishing timezone support, failure notifications, and retry handling
- `[Next]` Structured application logs and operator alert integrations

### Security and media hardening

- `[Next]` File-size limits, upload quotas, and per-role upload policies
- `[Next]` SVG and media-content safety checks with safer default handling for active formats
- `[Next]` Image metadata extraction, automatic resizing, WebP/AVIF variants, and thumbnails
- `[Next]` Unused-media detection, cleanup workflow, and storage usage reporting
- `[Next]` Per-user 2FA enrollment, password self-service, recovery flow, and login-session listing
- `[Next]` Public form rate limiting, submission retention policies, email notifications, and CSV export

### Editorial workflow

- `[Next]` Autosave drafts and crash recovery
- `[Next]` Private preview links with expiration
- `[Next]` Editorial review states and approval workflow separate from publication status
- `[Next]` Post/page import and export for migration and portability
- `[Next]` Redirect manager and 404 report for slug changes and broken links
- `[Next]` Japanese-aware full-text search and search administration tools

## Later roadmap

### Site and theme management

- `[Later]` Theme settings UI for colors, typography, spacing, and Google Fonts
- `[Later]` Theme starter kits and reusable public templates
- `[Later]` Visual layout blocks with responsive previews
- `[Later]` Local font hosting and privacy-first asset mode
- `[Later]` Multi-language content, locale routing, and translation metadata

### API and integrations

- `[Later]` Scoped API keys and machine-user management
- `[Later]` Webhooks for publishing, form submissions, media events, and backup events
- `[Later]` OAuth or OIDC login integration
- `[Later]` External object storage adapters such as S3-compatible storage
- `[Later]` Search adapters for larger installations

### Operations at scale

- `[Later]` Distributed scheduler locks for multi-instance deployments
- `[Later]` Queue-backed rendering and media processing
- `[Later]` Automated off-site backup rotation and restore drills
- `[Later]` Metrics dashboard for publishing, traffic, forms, storage, and errors
- `[Later]` Database health, slow-query, and retention management tools

## Priority order

1. `[Next]` Tests, CI, and permission regression coverage
2. `[Next]` Atomic publishing, preview, health checks, and structured alerts
3. `[Next]` Media and upload security hardening
4. `[Next]` Editorial autosave, preview, and review workflow
5. `[Next]` Forms operations, imports/exports, redirects, and Japanese search
6. `[Later]` Themes, integrations, scale-out operations, and localization

## Notes for contributors

- roadmap items are directional, not contractual
- existing `public_html` sites must keep working without a full CMS takeover
- safety, data portability, and backward-compatible migrations take priority over convenience
- every completed item should include documentation and an appropriate verification path
