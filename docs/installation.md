# Installation Guide

## Requirements

Before installing Hybrid-Static-CMS, the operator should understand these prerequisites:

- Bun runtime is required for the application server
- TypeScript 7-compatible tooling is expected for local development
- PostgreSQL is required for persistence and full-text search
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
- `PUBLIC_HTML_DIR`: document root used for generated artifacts
- `CONTROL_PANEL_PATH`: admin route prefix
- `CMS_API_PREFIX`: API route prefix
- `CMS_OUTPUT_DIR`: generated CMS output directory

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

5. Start the application.

```bash
bun run dev
```

## Docker setup

This repository also includes a container baseline:

```bash
docker compose up --build
```

The included `docker-compose.yml` starts:

- `postgres`
- `app`

The app container currently runs migrations and seed automatically on startup for convenience. For production, many users will prefer separating migration execution from the normal app boot flow.
