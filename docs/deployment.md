# Deployment

## Recommended production layout

The main production recommendation is:

- Keep the public site in the normal `public_html`
- Run Hybrid-Static-CMS as a separate Bun service
- Reverse proxy only the control panel and API routes
- Allow the Bun app to write generated artifacts into the CMS output area

Example target layout:

```txt
/home/example/
  public_html/
    index.html
    about.php
    cms/
  hybrid-static-cms/
    src/
    storage/
    migrations/
```

## Reverse proxy example

### Nginx

```nginx
location /control-panel {
  proxy_pass http://127.0.0.1:3000/control-panel;
}

location /cms-api/ {
  proxy_pass http://127.0.0.1:3000/cms-api/;
}
```

Everything else should continue to resolve to the normal document root.

## File ownership and write access

The installing user should verify:

- The Bun process can write to the configured `CMS_OUTPUT_DIR`
- The Bun process can write to `storage/`
- The reverse proxy user does not need direct access to application internals

Generated outputs currently include:

- post list fragments
- paginated list pages
- CMS-managed page HTML files
- CMS-managed form HTML files
- media files under `/cms/uploads/`
- RSS
- sitemap
- robots.txt
- llms.txt
- embed script

## Health checks

The application exposes two unauthenticated operational endpoints:

- `/healthz` returns HTTP 200 when the Bun process is responding.
- `/readyz` checks the PostgreSQL connection, `PUBLIC_HTML_DIR`, and `CMS_OUTPUT_DIR`. It returns HTTP 200 when ready and HTTP 503 when a dependency is unavailable.

Use `/healthz` for liveness checks and `/readyz` for load balancer, container, or supervisor readiness checks. The response does not include database credentials or connection details.

Operational data also includes database-backed file snapshots for selected `public_html` files.

## Form spam protection notes

If you enable Google reCAPTCHA v3 for published forms:

- set `RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY`, and optionally `RECAPTCHA_MIN_SCORE`
- allow the application server to make outbound HTTPS requests to `www.google.com`
- remember that forms stay usable without reCAPTCHA if those keys are left unset
- when verification fails, the submission is rejected before it is stored

## SEO output notes

Operators should understand these generated SEO files and controls:

- `public_html/sitemap.xml` includes published posts and pages except entries marked `noindex`
- `public_html/robots.txt` is generated automatically and points crawlers at the sitemap
- `/control-panel` and `/cms-api` are disallowed in the generated `robots.txt`
- Per-entry `noindex` and `nofollow` flags are emitted as `<meta name="robots">` on generated post and page HTML
- `public_html/llms.txt` is generated automatically for AI agents and lists public entry points plus restricted paths
- The default AI policy is permissive for public content and restrictive only for authenticated or operational routes

## Coexistence rules

These are important for adopters:

- Hybrid-Static-CMS should not take ownership of the entire website unless you intentionally build it that way
- Existing `public_html` pages should keep working even if the CMS is temporarily unavailable
- Static fragments are the safest default for high-compatibility installations
- Use API or embed modes only where dynamic behavior is worth the dependency

## Deployment models

For a production-oriented Docker stack, use `docker-compose.production.yml`. It avoids publishing PostgreSQL's port, waits for database health, does not seed data automatically, and keeps `public_html`, storage, templates, and plugins in explicit host-mounted locations.

### VPS model

Best overall fit.

- Bun service under systemd or a similar supervisor
- PostgreSQL on the same server or nearby managed instance
- Nginx reverse proxy

### Docker model

Good for teams and OSS adopters.

- Containerized Bun app
- Containerized PostgreSQL
- Reverse proxy managed separately or in the same stack

### Shared hosting bridge model

Possible only as a hybrid arrangement.

- `public_html` remains on a PHP-capable shared host
- Hybrid-Static-CMS runs on a separate Bun-capable server
- Content is pulled in via generated artifacts, embeds, or API responses

This model needs more operational care and is not the simplest first deployment.
