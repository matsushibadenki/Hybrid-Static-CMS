# Installation Guide

## Requirements

Before installing Hybrid-Static-CMS, the operator should understand these prerequisites:

- Bun runtime is required for the application server
- TypeScript 7-compatible tooling is expected for local development
- PostgreSQL is required for persistence and full-text search
- PostgreSQL client tools (`pg_dump` and `psql`) are required for the optional backup and restore commands
- A reverse proxy such as Nginx or Apache is recommended
- The host should allow a long-running Bun process or a containerized equivalent

This project is best suited for:

- VPS deployments
- Docker-based environments
- Agency-managed infrastructure

It is not ideal for low-cost shared hosting that only supports PHP with no persistent application process.

## Environment variables

Copy `.env.example` to `.env` and review every value:

```bash
cp .env.example .env
```

Important settings:

- `PORT`: Bun application port
- `APP_URL`: canonical external URL
- `SESSION_SECRET`: cookie/session secret, must be changed
- `DATABASE_URL`: PostgreSQL connection string
- `RECAPTCHA_SITE_KEY`: Google reCAPTCHA v3 site key for public forms
- `RECAPTCHA_SECRET_KEY`: Google reCAPTCHA v3 secret key for server-side verification
- `RECAPTCHA_MIN_SCORE`: minimum accepted v3 score, default `0.5`
- `LOGIN_MAX_ATTEMPTS`: failed login attempts allowed per IP/email key, default `8`
- `LOGIN_WINDOW_SECONDS`: login throttling window, default `900`
- `TWO_FACTOR_ENABLED`: set to `true` to require TOTP for all admin logins
- `TWO_FACTOR_SECRET`: Base32 TOTP secret used when two-factor login is enabled
- `COOKIE_SECURE`: set to `true` for HTTPS deployments; defaults automatically from an `https://` `APP_URL`
- `TRUST_PROXY`: set to `true` only when a trusted reverse proxy sets client IP headers
- `PUBLIC_HTML_DIR`: document root used for generated artifacts
- `CONTROL_PANEL_PATH`: admin route prefix
- `CMS_API_PREFIX`: API route prefix
- `CMS_OUTPUT_DIR`: generated CMS output directory
- `TEMPLATE_DIR`: optional template override directory, default `./templates`
- `GOOGLE_FONTS_CSS_URLS`: comma-separated Google Fonts CSS URLs for generated static pages; the bundled default includes Google Sans Flex, Noto Sans JP, Noto Sans Mono, Noto Serif JP, Roboto, Zen Maru Gothic, and Material Symbols Outlined

## Local setup

1. Install dependencies.

```bash
bun install
```

2. Create a PostgreSQL database.

Example database name:

```txt
hybrid_static_cms
```

3. Run migrations.

```bash
bun run migrate
```

Alternatively, start the app and open `/setup`. The setup wizard can run pending migrations, create the first administrator, write the main environment settings, and lock itself after an administrator exists. PostgreSQL and the database named by `DATABASE_URL` must already be available.

4. Seed the initial admin user and sample content.

```bash
bun run seed
```

Default seed credentials:

- Email: `owner@example.com`
- Password: `change-me-now`

Change this password immediately in any real environment.

The seed also creates:

- one sample published post
- one sample published CMS-managed page
- one sample published contact form

Uploads are not seeded, but the media library becomes available after migration under the control panel.

Published navigation menus are available under `/control-panel/menus`. Their static HTML output is written to `/cms/menus/{slug}.html`, which can be included by an existing HTML or PHP page.

Reusable blocks are managed under `/control-panel/blocks`. Add `[[block:slug]]` to a CMS-managed page's Body HTML to expand a published block during static rendering. Draft or missing blocks are not exposed as published content.

## Article editor

The post editor provides a safe HTML writing toolbar for bold, italic, strikethrough, blockquotes, unordered and numbered lists, H1-H4 headings, left/center/right/justified alignment, links, code blocks, and horizontal rules. The editor also supports direct upload and insertion of images, video, audio, PDF, and text files. Uploaded files are stored in the media library under `/cms/uploads/`.

The HTML sanitizer keeps the supported formatting tags and removes scripts and unsupported attributes before content is saved. Use the Body HTML editor for rich content; the Markdown-like field remains available for simpler posts and migration-friendly authoring.

### LaTeX mathematics

The standard generated template loads MathJax 3 and supports LaTeX in both fields. Use `\(...\)` for inline mathematics and `\[...\]` or `$$...$$` for display mathematics. The post editor toolbar includes `Math` and `Math block` helpers. Sites using a custom `templates/page.html` must include MathJax 3 in that template if they want the same rendering behavior.

### Mermaid charts

The standard generated template also loads Mermaid 11. Use the `Mermaid` toolbar button to insert a chart code block, or add a fenced block beginning with ````mermaid`` in the Markdown-like field. For custom `templates/page.html` files, include Mermaid 11 and initialize it after the generated body is loaded.

### Text size and ruby

The editor includes four text-size presets (`A-`, `A`, `A+`, and `A++`) and a `Ruby` helper. Select text, choose a size, or choose `Ruby` and enter its reading. Ruby is stored as semantic HTML using `ruby` and `rt` elements, with fallback parentheses for browsers that do not support ruby layout.

## Template overrides

Copy `templates/page.html.example` to `templates/page.html` to override the generated CMS page shell. The renderer replaces `{{title}}`, `{{description}}`, `{{canonical}}`, `{{ogTitle}}`, `{{ogDescription}}`, `{{ogType}}`, `{{ogUrl}}`, `{{robots}}`, `{{jsonLd}}`, and `{{body}}`. If the override is absent, the built-in safe template is used.

The built-in template uses an editorial magazine layout: a paper-texture background, masthead, fine rules, oversized headlines, and a responsive asymmetric index. It is applied to generated posts and CMS-managed pages when no `templates/page.html` override exists. Copy the example template when the site needs a different visual system; custom templates remain responsible for their own CSS and shell markup.

The built-in template automatically loads the Google Fonts URLs from `GOOGLE_FONTS_CSS_URLS`. Add another Google Fonts CSS2 URL separated by a comma to make a font available, then use its family name in a template or plugin stylesheet. For privacy-sensitive or offline deployments, set the variable to an empty value and provide local font files in the custom template instead. Only `fonts.googleapis.com` and `fonts.gstatic.com` URLs are accepted.

SEO fields include optional canonical URL, OG image URL, and comma-separated keywords. Empty fields use safe title, excerpt, canonical, and structured-data fallbacks. Canonical URLs are also used in the generated sitemap unless an entry is marked `noindex`.

Plugins can be placed in `PLUGIN_DIR` (default `./plugins`). Each `.ts`, `.js`, or `.mjs` module may export a default function receiving `{ registerHook, emitHook, registerApiRoute, registerAdminLink }`. Supported hooks are `beforeRender`, `afterRender`, and `audit`; plugins can also register custom API routes and control-panel links.

AI integrations should submit proposals to `POST /cms-api/ai/proposals` with an authenticated session and JSON fields `relativePath`, `proposedContent`, and `reason`. Operators review pending proposals at `/control-panel/proposals`; protected paths such as `/cms`, dot directories, `storage`, `private`, and `secrets` are rejected.

## User management

Owners and administrators can manage accounts at `/control-panel/users`. Each account can be assigned one or more roles: `owner`, `admin`, `editor`, `author`, `viewer`, or `ai_agent`.

- Deactivating an account immediately revokes its database sessions and prevents new logins.
- Resetting a password revokes all existing sessions for that account.
- An administrator cannot edit or grant the `owner` role; only an owner can manage owners.
- An operator cannot deactivate their own account or remove their own administrative access.
- Passwords are stored as PBKDF2-derived hashes and are never displayed after creation.

Apply migration `016_user_management.sql` with `bun run migrate` before using this screen on an existing installation.

### Permission model

Permissions are evaluated on every control-panel request and authenticated API mutation, not only on navigation links. `owner` and `admin` have full operational access. `editor` can manage and publish content, forms, media, menus, and blocks but cannot delete content, restore revisions, manage users, review AI proposals, or operate snapshots. `author` can create and edit posts and upload media but cannot publish, delete, or manage other content types. `viewer` has read-only control-panel access. `ai_agent` can submit AI file proposals through the API but cannot sign in to the control panel.

The following sensitive actions are independently protected: publishing, deletion, revision restore, snapshot restore, user management, AI proposal review, and AI proposal creation. This keeps a role useful without granting every administrative capability.

5. Start the application.

```bash
bun run dev
```

## PostgreSQL backup and restore

After installation, create a database backup with:

```bash
bun run db:backup
```

To restore a SQL backup, use an explicit confirmation flag because existing database tables may be replaced:

```bash
bun run db:restore -- --input /path/to/backup.sql --confirm
```

Backups are written to `storage/backups` by default. This directory is excluded from Git. Keep independent copies of `public_html` and uploaded media because PostgreSQL backups contain database records only.

## Optional two-factor login

Two-factor login uses a standard six-digit TOTP authenticator code. Set `TWO_FACTOR_ENABLED=true` and provide a Base32 `TWO_FACTOR_SECRET` in `.env`, then protect that secret as carefully as the session secret. This MVP configuration applies the same TOTP secret to all admin accounts; use a separate deployment or a future per-user 2FA extension when administrators need individual enrollment.

## reCAPTCHA v3 for forms

If you want spam protection on published forms, configure these values in `.env`:

```txt
RECAPTCHA_SITE_KEY=your_site_key
RECAPTCHA_SECRET_KEY=your_secret_key
RECAPTCHA_MIN_SCORE=0.5
```

Behavior:

- when both keys are set, published form HTML includes the reCAPTCHA v3 client flow
- form submissions are verified server-side before they are stored
- when keys are not set, form submission continues without reCAPTCHA verification

## Docker setup

This repository also includes a container baseline:

```bash
docker compose up --build
```

The included `docker-compose.yml` starts:

- `postgres`
- `app`

The app container currently runs migrations and seed automatically on startup for convenience. For production, many users will prefer separating migration execution from the normal app boot flow.
