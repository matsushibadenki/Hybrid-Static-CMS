# Contributing

## Development setup

1. Copy `.env.example` to `.env` and use a disposable PostgreSQL database.
2. Run `bun install` and `bun run migrate`.
3. Use `bun run dev` for local development.
4. Run the TypeScript check before submitting changes:

```bash
bun run check
```

## Change boundaries

- Preserve the `public_html` coexistence model.
- Keep secrets, database dumps, uploads, generated artifacts, and private paths out of commits.
- Add schema changes as new numbered migrations.
- Update the relevant `docs/` page and `docs/roadmap.md` when behavior changes.
- Prefer existing validation, audit, CSRF, snapshot, and renderer helpers over duplicate implementations.

## Pull requests

Explain the user-visible behavior, migration impact, security implications, and verification performed. Include manual setup steps when a new environment variable, plugin hook, or generated output is introduced.
