# Architecture

## Core idea

Hybrid-Static-CMS is not designed as a full-site replacement CMS like WordPress. Its primary model is a **public_html coexistence CMS**:

- Existing HTML/PHP files remain in the main document root
- The Bun application can live outside `public_html`
- The control panel and CMS API are reverse-proxied into the same domain
- Published content can be consumed as static fragments, API responses, or client-side embeds

## Target structure

```txt
/home/user/
  public_html/
    index.html
    about.php
    assets/
    cms/
      posts/
        latest.html
        list.html
        page/
      embed.js
      posts/rss.xml
  hybrid-static-cms/
    src/
    storage/
    config/
    migrations/
```

In this repository, `public_html/` is included for local development, but production users can place the Bun app in a sibling directory outside the public web root.

## Routing model

```txt
/                  -> existing public_html site
/control-panel     -> Bun admin panel
/cms-api/*         -> Bun JSON API
/cms/*             -> generated fragments and embed script
```

This allows an existing site to adopt CMS functionality without surrendering all page rendering to the CMS.

## Content delivery modes

### 1. Static HTML fragments

Use when the host site is plain HTML or PHP and wants the lowest runtime overhead.

Examples:

```php
<?php include __DIR__ . "/cms/posts/latest.html"; ?>
```

Generated files include:

- `public_html/cms/posts/latest.html`
- `public_html/cms/posts/list.html`
- `public_html/cms/posts/{slug}.html`
- `public_html/cms/posts/page/{n}.html`
- `public_html/cms/posts/rss.xml`
- `public_html/sitemap.xml`
- `public_html/robots.txt`
- `public_html/llms.txt`

### 2. JavaScript embedding

Use when the host site cannot include server-side fragments.

```html
<div data-hybrid-static-cms-posts data-limit="5" data-category="news"></div>
<script src="/cms/embed.js"></script>
```

### 3. JSON API

Use when the host site is React, Vue, another backend, or a custom frontend.

```txt
GET /cms-api/posts
GET /cms-api/posts/:slug
GET /cms-api/search?q=...
```

## Current MVP boundaries

Included now:

- Bun + Hono server
- PostgreSQL-backed posts, pages, media, users, sessions, settings
- Cookie login for admin
- Server-rendered control panel
- Post CRUD
- Page CRUD
- Form CRUD and submission capture
- CMS-managed navigation menus
- Reusable published content blocks for CMS-managed pages
- Media uploads
- File snapshots
- SEO-aware static post and page output
- Per-entry `noindex` and `nofollow` SEO controls
- AI-oriented discovery files via `robots.txt` and `llms.txt`
- Static fragment generation
- Embed script generation

Planned next:

- AI proposal workflow with approval gates
- Plugin hooks
