# BunPress Core

BunPress Core is a Bun-powered CMS designed to coexist with an existing `public_html` site instead of replacing it. It lets teams keep legacy HTML/PHP pages, then layer in CMS-driven posts, static fragments, embeddable widgets, and an admin panel under a reverse-proxied control path.

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

## MVP included in this repository

- Bun + Hono server
- PostgreSQL-backed posts, categories, tags, users, sessions, and settings
- Cookie-based admin authentication
- Server-rendered admin panel under `/control-panel`
- Post CRUD with publish/draft status
- Page CRUD with CMS-managed static page output
- Static renderer for:
  - `public_html/cms/posts/latest.html`
  - `public_html/cms/posts/list.html`
  - `public_html/cms/posts/page/{n}.html`
  - `public_html/cms/pages/{slug}.html`
  - `public_html/cms/posts/rss.xml`
  - `public_html/sitemap.xml`
- Embeddable client script at `public_html/cms/embed.js`
- JSON API at `/cms-api/posts`, `/cms-api/posts/:slug`, `/cms-api/search`

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

Reverse proxy and deployment notes are documented in `docs/deployment.md`.

## Embedding content

### Static include

```php
<?php include __DIR__ . "/cms/posts/latest.html"; ?>
```

### JavaScript embedding

```html
<div data-bunpress-posts data-limit="5" data-category="news"></div>
<script src="/cms/embed.js"></script>
```

### REST API

```txt
GET /cms-api/posts
GET /cms-api/posts/my-first-post
GET /cms-api/pages
GET /cms-api/pages/about-this-site
GET /cms-api/search?q=hello
```

## Open-source direction

This repository is intentionally generic and keeps the extension surface narrow. Ongoing adopter notes and future setup guidance should be added under `docs/` as the project grows.
