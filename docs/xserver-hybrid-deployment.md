# XServer Hybrid Deployment

For production workloads, run Hybrid-Static-CMS on XServer VPS Cloud as the system of record: an App VPS serves Bun, Managed PostgreSQL stores CMS data, and NFS stores `public_html`, uploads, templates, and protected backups.

Run independent AI, crawler, and batch workloads on a separate ordinary VPS Worker. The Worker must not connect directly to Managed PostgreSQL. It communicates with the CMS through HTTPS API credentials with narrow scopes, or through signed job endpoints. This keeps database credentials and private storage inside the Cloud boundary.

## Boundaries

- Cloud App VPS: Bun application, control panel, `/cms-api`, rendering scheduler, and public output.
- Managed PostgreSQL: CMS data, audit logs, metrics, API keys, and background jobs.
- NFS: shared artifacts and uploads for Cloud application instances only.
- Worker VPS: AI proposals, crawling, and batch work; no NFS mount or database network access.

## Verification

1. Confirm the Worker cannot reach the Managed PostgreSQL network address.
2. Use a separate scoped API key for each Worker and verify it cannot access unrelated actions.
3. Keep database, NFS, backup, and rclone credentials only on the Cloud App VPS.
4. Review audit logs and test API-key revocation when a Worker is retired.
