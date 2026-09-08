# CI test execution

GitHub Actions runs `bun test --timeout 30000` with PostgreSQL 18 and
`RUN_DB_INTEGRATION_TESTS=true`. The timeout is per test and includes fixture
creation, static HTML generation, and asynchronous cleanup. Bun's default
five-second limit can interrupt these operations on shared runners, leaving
unfinished work to interfere with later tests.

Use the same command locally against a dedicated test database after running
`bun run migrate`. PostgreSQL 18 client commands (`pg_dump`, `createdb`,
`dropdb`, and `psql`) must be available for backup and restore tests.

Background-job tests process preceding queued work before checking their own
job's completion and remove their own job records after testing. Run integration
tests only against a disposable test environment, without an application scheduler
running concurrently. A timeout still requires investigation if it recurs with
the 30-second limit; increasing the limit does not resolve blocked queries or locks.
