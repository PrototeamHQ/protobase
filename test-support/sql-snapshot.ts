// Snapshot tests: SQL recorded from real Postgres by `bun run test:record` and replayed without a database. See
// sql-snapshot/snapshot-db.ts for the database, sql-snapshot/setup.ts for what makes record and replay agree, and
// scripts/test-db/snapshot-templates.ts for the databases recording starts from.
export { openSnapshotDb, type SnapshotDb } from './sql-snapshot/snapshot-db'
export { testClock } from './sql-snapshot/clock'
