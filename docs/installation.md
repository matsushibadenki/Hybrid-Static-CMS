# Installation Guide

## Requirements

Before installing Hybrid-Static-CMS, the operator should understand these prerequisites:

- Bun runtime is required for the application server
- TypeScript 7-compatible tooling is expected for local development
- PostgreSQL 18 is required for persistence and full-text search
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
- `SEED_ADMIN_EMAIL`: email used by the optional seed script to create the initial local administrator
- `SEED_ADMIN_PASSWORD`: password used by the optional seed script; use a strong value and change it after first login
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
- `MAX_UPLOAD_BYTES`: maximum size for each uploaded media file, default `20971520` (20 MB)
- `ALLOW_SVG_UPLOADS`: set to `true` only when SVG uploads are required; disabled by default because SVG can contain active content. Enabled SVG files are sanitized before storage.
- `FORM_RATE_LIMIT_ATTEMPTS`: accepted public form submissions per client and form in one window, default `5`
- `FORM_RATE_LIMIT_WINDOW_SECONDS`: public form rate-limit window, default `300`
- `FORM_SUBMISSION_RETENTION_DAYS`: delete stored form submissions older than this many days during scheduled housekeeping; `0` disables automatic deletion
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_TLS`: implicit-TLS SMTP server settings for form notifications; defaults target port `465` with TLS enabled
- `SMTP_HOSTNAME`: hostname sent in `EHLO`, default `localhost`
- `SMTP_USERNAME`, `SMTP_PASSWORD`: optional SMTP `AUTH LOGIN` credentials
- `SMTP_FROM`: sender address; notifications remain disabled unless this and `FORM_NOTIFICATION_EMAIL` are configured
- `FORM_NOTIFICATION_EMAIL`: destination address for new public form submissions
- `GOOGLE_FONTS_CSS_URLS`: pipe-separated (`|`) Google Fonts CSS URLs for generated static pages; the bundled default includes Google Sans Flex, Noto Sans JP, Noto Sans Mono, Noto Serif JP, Roboto, Zen Maru Gothic, and Material Symbols Outlined

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

Alternatively, start the app and open `/setup`. The setup wizard can run pending migrations, create the first administrator, write the main environment settings, and lock itself after an administrator exists. PostgreSQL 18 and the database named by `DATABASE_URL` must already be available.

4. Seed the initial admin user and sample content.

```bash
bun run seed
```

The seed administrator is configured by `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in `.env`.

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

Media uploads also receive a lightweight content-signature check for common image, video, audio, and PDF formats. The server does not rely only on the browser-provided MIME type. Files that do not match their declared type are rejected.

Public form submissions are rate-limited in PostgreSQL before reCAPTCHA verification. When `TRUST_PROXY=true` is enabled behind a trusted reverse proxy, the limit is applied per client IP and form. Without a trusted proxy, the application uses a conservative shared key because forwarded IP headers must not be trusted.

Form administrators can download submissions as UTF-8 CSV from the form edit screen. The export includes the submission timestamp and one column for each configured field. Set `FORM_SUBMISSION_RETENTION_DAYS` only after confirming the site's legal and operational retention requirements; automatic deletion cannot be undone from the CMS.

When all SMTP notification variables are configured, a successful public form submission triggers a plain-text email. SMTP delivery failures do not reject the visitor's submission; they create an operator notification and audit entry. The built-in sender uses implicit TLS (normally port 465), so deployments requiring STARTTLS should place an SMTP relay in front of the CMS or use a provider's implicit-TLS endpoint.

### LaTeX mathematics

The standard generated template loads MathJax 3 and supports LaTeX in both fields. Use `\(...\)` for inline mathematics and `\[...\]` or `$$...$$` for display mathematics. The post editor toolbar includes `Math` and `Math block` helpers. Sites using a custom `templates/page.html` must include MathJax 3 in that template if they want the same rendering behavior.

### Mermaid charts

The standard generated template also loads Mermaid 11. Use the `Mermaid` toolbar button to insert a chart code block, or add a fenced block beginning with ````mermaid`` in the Markdown-like field. For custom `templates/page.html` files, include Mermaid 11 and initialize it after the generated body is loaded.

### Text size and ruby

The editor includes four text-size presets (`A-`, `A`, `A+`, and `A++`) and a `Ruby` helper. Select text, choose a size, or choose `Ruby` and enter its reading. Ruby is stored as semantic HTML using `ruby` and `rt` elements, with fallback parentheses for browsers that do not support ruby layout.

## Template overrides

Copy `templates/page.html.example` to `templates/page.html` to override the generated CMS page shell. The renderer replaces `{{title}}`, `{{description}}`, `{{canonical}}`, `{{ogTitle}}`, `{{ogDescription}}`, `{{ogType}}`, `{{ogUrl}}`, `{{robots}}`, `{{jsonLd}}`, and `{{body}}`. If the override is absent, the built-in safe template is used.

The built-in template uses an editorial magazine layout: a paper-texture background, masthead, fine rules, oversized headlines, and a responsive asymmetric index. It is applied to generated posts and CMS-managed pages when no `templates/page.html` override exists. Copy the example template when the site needs a different visual system; custom templates remain responsible for their own CSS and shell markup.

The built-in template automatically loads the Google Fonts URLs from `GOOGLE_FONTS_CSS_URLS`. Add another Google Fonts CSS2 URL separated by `|` to make a font available. A pipe is used because Google Fonts CSS URLs commonly contain commas in their axis definitions. If you previously used comma-separated values, change the separator to `|`. For privacy-sensitive or offline deployments, set the variable to an empty value and provide local font files in the custom template instead. Only `fonts.googleapis.com` and `fonts.gstatic.com` URLs are accepted.

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

Run the local quality checks with:

```bash
bun run check
bun test
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

### Installation and first-run cautions

Choose one application startup mode at a time. The Docker `app` service and `bun run dev` both listen on port `3000`; starting both will produce a `Failed to start server. Is port 3000 in use?` error.

For local development, start only PostgreSQL in Docker and run the Bun server on the host:

```bash
docker compose up -d postgres
bun run dev
```

Alternatively, run the complete Docker stack and do not start `bun run dev` in another terminal:

```bash
docker compose up -d
```

The development Compose file maps PostgreSQL to host port `5432`. Check for another local PostgreSQL instance before starting it:

```bash
lsof -nP -iTCP:5432 -sTCP:LISTEN
```

If Homebrew PostgreSQL is using the port, inspect the exact service name before stopping it. For example, a versioned service may need:

```bash
brew services list
brew services stop postgresql@14
```

Do not assume that `brew services stop postgresql` stops a versioned service. The Homebrew database and the Docker database are separate PostgreSQL installations and may contain different databases and users.

### Setup and seed behavior

The interactive `/setup` wizard creates the first administrator using the values entered in the form. It is locked after an administrator exists.

The development Docker Compose command currently runs:

```bash
bun run migrate && bun run seed && bun run start
```

Therefore, a fresh Docker database is automatically seeded before the application starts. The seed script creates the configured administrator when that email does not already exist. It does not overwrite an existing user's password or email.

The seed script also creates sample content. Change this password immediately in any environment that contains data that matters. If you want to use `/setup` instead, remove `bun run seed &&` from the Compose app command before creating a fresh database, then start only PostgreSQL and run `bun run dev`.

### Re-running setup with a database reset

The setup page provides a guarded application database reset for a logged-in `owner` or `admin`. Open `/setup`, type `RESET DATABASE`, and submit the reset form.

The reset deletes application data, including users, sessions, posts, pages, forms, menus, settings, audit records, and login-attempt records. It preserves:

- the database schema and migration history
- the PostgreSQL Docker volume
- `public_html` and generated files
- media and uploaded files on disk

After the reset completes, follow the link to `/setup` and create a new administrator. This operation is destructive and should be preceded by a backup when the database contains anything important:

```bash
bun run db:backup
```

Do not use `docker compose down -v` for this workflow unless deleting the entire PostgreSQL volume is intentional. That command removes the database volume and all data stored in it, whereas the `/setup` reset preserves the schema and volume.

### Troubleshooting authentication

If login fails after setup, verify that the Bun process and the PostgreSQL container use the same `DATABASE_URL`. A host-run Bun process normally uses `localhost`; an app container must use the Compose service name `postgres`:

```text
# Bun running on the host
postgres://postgres:postgres@localhost:5432/hybrid_static_cms

# App running inside Docker Compose
postgres://postgres:postgres@postgres:5432/hybrid_static_cms
```

Repeated failed attempts are rate-limited by IP and email for the configured login window. During local troubleshooting, an administrator can wait for the window to expire or clear the `login_attempts` table after confirming that this is a disposable development database.
