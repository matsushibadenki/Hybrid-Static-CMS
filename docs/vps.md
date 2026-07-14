# VPS Production Guide

## Layout

Keep the existing website and the application separate:

```txt
/srv/example-site/public_html/
/srv/example-site/Hybrid-Static-CMS/
/srv/example-site/Hybrid-Static-CMS/storage/
```

Set `PUBLIC_HTML_DIR` to the existing document root and keep the application directory outside the public web root.

## Service account

Run Bun as a dedicated unprivileged user. Grant it write access only to `CMS_OUTPUT_DIR`, `CMS_UPLOAD_DIR`, and `storage`. Do not grant the reverse proxy direct access to the application source, `.env`, migrations, or database credentials.

## Deployment sequence

1. Install Bun, PostgreSQL client tools, and a reverse proxy.
2. Create the database and a restricted database user.
3. Copy `.env.example` to `.env` and set strong secrets.
4. Run `bun install --frozen-lockfile`, `bun run migrate`, and `bun run seed` only for a new installation.
5. Create a PostgreSQL backup before upgrades.
6. Start `bun run start` under systemd or another process supervisor.
7. Reverse proxy `/control-panel` and `/cms-api` to the Bun service.
8. Confirm generated `/robots.txt`, `/llms.txt`, and `/sitemap.xml` match the intended policy.

## Backup policy

Back up PostgreSQL, `public_html`, and `storage` independently. Test restoration on a separate database and document the target Bun, PostgreSQL, and schema versions.
