# Docs Index

This directory collects the design, installation, deployment, and operations notes that people adopting Hybrid-Static-CMS should read before setup.

## Recommended reading order

1. [Project concept](./architecture.md)
2. [Installation guide](./installation.md)
3. [Deployment and coexistence model](./deployment.md)
4. [Operations and security notes](./operations.md)
5. [Public assets and content stylesheets](./assets.md)
6. [Post permalink settings](./permalinks.md)
7. [Article comments](./comments.md)
8. [Scheduled publishing](./scheduled-publishing.md)
9. [Control panel layout](./control-panel-layout.md)
10. [Media upload policies](./media-upload-policies.md)
11. [Optional Stalwart mail server](./stalwart-mail-server.md)
12. [Account security and personal 2FA](./account-security.md)
13. [Editor autosave and recovery](./editor-autosave.md)
14. [Editorial review workflow](./editorial-workflow.md)
15. [Maps and reusable snippets](./maps-and-snippets.md)
16. [Post and page import/export](./content-portability.md)
17. [Redirects and 404 reporting](./redirects-and-404s.md)
18. [Structured logging and operator alerts](./structured-logging.md)
19. [Roadmap](./roadmap.md)
20. [VPS production guide](./vps.md)
21. [Upgrade guide](./upgrade.md)
22. [Architecture decision records](./adr/0001-public-html-coexistence.md)

## Audience

- Site owners deciding whether Hybrid-Static-CMS fits their current `public_html` workflow
- Engineers preparing Bun + PostgreSQL infrastructure
- Agencies and OSS adopters who need a generic deployment baseline

## Documentation policy

Every user-facing feature must be documented in the same change that implements
it. Add a dedicated page when the feature needs setup or operational guidance,
and link that page from this index. At minimum, document:

- what the feature does and where it appears in the control panel
- setup steps, environment variables, defaults, and safe configuration examples
- usage from CMS content, APIs, or `public_html`, where applicable
- roles and permissions, public data exposure, and security or privacy cautions
- database migrations, generated files, deployment impact, and upgrade steps
- current limitations, fallback behavior, and a verification procedure

Update `roadmap.md` to reflect the implementation status and `upgrade.md` when an
existing installation must run a migration or change its configuration. Examples
must remain generic and must not contain private filesystem paths, credentials,
domains, email addresses, or installation-specific identifiers.
