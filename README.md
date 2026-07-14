# Hybrid-Static-CMS

Hybrid-Static-CMS is a Bun-powered CMS designed to coexist with an existing `public_html` site instead of replacing it. It lets teams keep legacy HTML/PHP pages, then layer in CMS-driven posts, static fragments, embeddable widgets, and an admin panel under a reverse-proxied control path.

## Why this project exists

- Existing sites can stay in `public_html` as-is.
- The CMS app can live outside public web root in production.
- Content can be consumed in three interchangeable ways:
  - Static HTML fragments for PHP includes and plain HTML sites
  - JavaScript embedding via `/cms/embed.js`
  - JSON APIs under `/cms-api/*`
- Rendering favors pre-generated fragments so normal page views do not need to hit the Bun API.

## Documentation

Operator-facing notes now live under `docs/README.md`.

- Architecture: `docs/architecture.md`
- Installation: `docs/installation.md`
- Deployment: `docs/deployment.md`
- Operations and security: `docs/operations.md`
- Roadmap: `docs/roadmap.md`

## MVP included in this repository

- Bun + Hono server
- TypeScript 7-compatible project configuration
- PostgreSQL 18-backed posts, pages, media, users, sessions, and settings
- Cookie-based admin authentication
- Audit log tracking for sign-in, publishing, media, and regeneration events
- File snapshots for safe text-based files under `public_html`
- Diff preview before snapshot restore
- Explicit restore confirmation step for snapshots
- Quick snapshot creation from post and page edit screens
- Server-rendered admin panel under `/control-panel`
- Post CRUD with publish/draft status
- Page CRUD with CMS-managed static page output
- Multiple form generation, management, deletion, and submission capture
- Media upload and library management under `/cms/uploads/*`
- Post and page media helpers for image, video, audio, and PDF embeds
- Google reCAPTCHA v3 support for public form submissions via `.env` keys
- PostgreSQL backup and restore CLI workflows using `pg_dump` and `psql`
- SEO-aware static output with canonical URLs, meta descriptions, structured data, robots controls, and AI-friendly `llms.txt`
- Manual snapshot creation and restore for `public_html` files
- Static renderer for:
  - `public_html/cms/posts/latest.html`
  - `public_html/cms/posts/list.html`
  - `public_html/cms/posts/{slug}.html`
  - `public_html/cms/posts/page/{n}.html`
  - `public_html/cms/pages/{slug}.html`
  - `public_html/cms/forms/{slug}.html`
  - `public_html/cms/posts/rss.xml`
  - `public_html/sitemap.xml`
  - `public_html/robots.txt`
  - `public_html/llms.txt`
- Embeddable client script at `public_html/cms/embed.js`
- JSON API at `/cms-api/posts`, `/cms-api/posts/:slug`, `/cms-api/search`
- Media API at `/cms-api/media`

## Directory layout

```txt
.
├── public_html/
│   ├── index.html
│   └── cms/
│       ├── posts/
│       └── embed.js
├── src/
│   ├── admin/
│   ├── core/
│   ├── scripts/
│   └── server/
├── migrations/
├── storage/
└── templates/
```

## Quick start

1. Install dependencies.

```bash
bun install
```

2. Copy the environment file and adjust values.

```bash
cp .env.example .env
```

3. Create the PostgreSQL database and run migrations.

```bash
bun run migrate
```

For an interactive first-run flow, start the app with `DATABASE_URL` configured and open `/setup` instead. The wizard creates the first administrator and locks itself after completion.

4. Seed a local admin user.

```bash
bun run seed
```

Default seed credentials:

- Email: `owner@example.com`
- Password: `change-me-now`

5. Start the app.

```bash
bun run dev
```

Create a Git-ignored PostgreSQL backup when needed:

```bash
bun run db:backup
```

Restore a SQL backup only with explicit confirmation:

```bash
bun run db:restore -- --input /path/to/backup.sql --confirm
```

Reverse proxy and deployment notes are documented in `docs/deployment.md`.

After running new migrations, posts and pages can also be marked with `noindex` and `nofollow` from the admin UI or API. Those flags are reflected in generated HTML, and `noindex` items are excluded from the generated sitemap.

The generated `robots.txt` allows broad crawling, including AI-facing crawlers, while excluding operational paths such as `/login`, `/control-panel`, and `/cms-api`. The generated `llms.txt` provides a machine-readable summary of public entry points and restricted paths for AI agents.

## Embedding content

### Static include

```php
<?php include __DIR__ . "/cms/posts/latest.html"; ?>
```

### JavaScript embedding

```html
<div data-hybrid-static-cms-posts data-limit="5" data-category="news"></div>
<script src="/cms/embed.js"></script>
```

### REST API

```txt
GET /cms-api/posts
GET /cms-api/posts/my-first-post
GET /cms-api/pages
GET /cms-api/pages/about-this-site
GET /cms-api/forms
GET /cms-api/media
GET /cms-api/search?q=hello
```

## Open-source direction

This repository is intentionally generic and keeps the extension surface narrow. Ongoing adopter notes and future setup guidance should be added under `docs/` as the project grows.
