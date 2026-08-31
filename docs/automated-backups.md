# Automated Off-Site Backups

Hybrid-Static-CMS can create one PostgreSQL SQL backup per UTC day from the built-in scheduler, retain a bounded number of local copies, optionally copy each completed file through `rclone`, and optionally run a rollback-only restore drill against a separate database.

The feature is disabled by default. It never copies `public_html`, uploaded media, local fonts, templates, plugins, or mail-server data. Back up those files independently.

## Enable automatic backups

Install PostgreSQL client tools (`pg_dump`, `psql`) on the application host, then configure:

```env
BACKUP_DIRECTORY=./storage/backups
BACKUP_AUTOMATION_ENABLED=true
BACKUP_SCHEDULE_HOUR_UTC=3
BACKUP_RETENTION_COUNT=14
```

The scheduler checks once per minute and runs once during the selected UTC hour. It records an attempted day in a protected state file, so a failure does not repeatedly start expensive backup jobs during the same hour. Operators receive a success or failure notification.

Local files are named `hybrid-static-cms-<UTC timestamp>.sql`, created with owner-only permissions, and rotated after a successful new backup. Set `BACKUP_RETENTION_COUNT` to the number of local generations to keep.

## Off-site copy with rclone

Configure an existing `rclone` remote on the host. Keep its credentials in the host's protected rclone configuration, not in this repository or `.env`.

```env
BACKUP_OFFSITE_RCLONE_PATH=/usr/local/bin/rclone
BACKUP_OFFSITE_RCLONE_REMOTE=backup-remote:cms-postgres
```

Both settings are required together. The executable path must be absolute. The remote is passed directly as an argument, never through a shell. After a successful copy, `rclone delete` removes managed SQL backup files older than the configured retention period from that remote prefix. Point the remote at a dedicated backup directory because the CMS does not delete unrelated files.

Test the remote before enabling automation:

```bash
/usr/local/bin/rclone lsd backup-remote:cms-postgres
```

## Restore drill

Set `BACKUP_RESTORE_DRILL_DATABASE_URL` only to a separate, disposable PostgreSQL database with the same extension and privilege requirements as the production database:

```env
BACKUP_RESTORE_DRILL_DATABASE_URL=postgres://backup_drill_user:strong-password@db.example.test:5432/hybrid_static_cms_drill
```

The drill sends `BEGIN`, restores the newly created SQL backup with `psql`, then sends `ROLLBACK`. It never permits the source and drill database to have the same host, port, and database name. A failed drill marks the automated backup run as failed and leaves the local file in place for investigation.

Do not use a production database URL for the drill. Review database roles, extensions, and connection limits before enabling it.

## Verification and recovery

1. Run `bun run db:backup` and confirm a protected SQL file appears in `BACKUP_DIRECTORY`.
2. Enable automation and select a near-future UTC hour in a non-production environment.
3. Confirm the operator notification, the local file, and the expected remote object.
4. When configured, confirm the restore-drill success notification.
5. Periodically perform a real recovery into an isolated environment, then run `bun run migrate` and regenerate public artifacts.

The automated drill validates that SQL can be replayed transactionally; it does not replace a full disaster-recovery exercise or backups of filesystem-managed content.
