import { randomBytes } from 'node:crypto'
import { configDefaults, defineConfig } from 'vitest/config'
import { runEnvironment } from './scripts/test-db/templates'

// Each integration run clones its own databases from the test templates (`bun run test:db`), named after this id, and
// drops them afterwards; DATABASE_URL points each project at its clone, never at a developer database.
const runId = randomBytes(4).toString('hex')
const testDatabase = 'scripts/test-db/global-setup.ts'
// Unit tests sit next to the code; tests that start a database, a subprocess or the network live in each package's
// tests/, and the examples' in tests/examples.
const unit = ['packages/*/src/**/*.test.ts', 'scripts/release-speed/**/*.test.ts', 'docs-examples/**/*.test.ts', 'examples/*/{config,jobs,emails,seed,map}/**/*.test.ts']
// Unit tests share one module registry per worker (`isolate: false`), which saves most of their time. These replace a
// module with `vi.mock`, change a global, the environment or the console without always putting it back, or send the
// process signals that a handler another file loaded would act on, so each runs in a registry of its own (project
// `unit-isolated`); a new unit test that does any of these belongs here.
const mocking = [
  'docs-examples/email.test.ts',
  'docs-examples/events/subscriptions.test.ts',
  'docs-examples/forms/forms.test.ts',
  'docs-examples/functions.test.ts',
  'packages/cli/src/build/bun-build.test.ts',
  'packages/cli/src/serve/crash-reports.test.ts',
  'packages/cli/src/serve/signals.test.ts',
  'packages/client/src/sign-in-flows.test.ts',
  'packages/server/src/dropped-connections.test.ts',
  'packages/server/src/files/providers.test.ts',
  'packages/server/src/files/store-file.test.ts',
  'packages/server/src/functions/require-env.test.ts',
  'packages/server/src/mail/define-email.test.ts',
  'packages/server/src/mail/smtp-mailer.test.ts',
  'packages/ui/src/app/error-reporting.test.ts',
  'packages/ui/src/app/pages/action-href.test.ts',
]
// Database, subprocess and build tests, and the release scripts': `bun run test:integration`.
const integration = ['packages/cli/tests/**/*.integration.test.ts', 'packages/cli/tests/build/deploy-bundle.test.ts', 'tests/release/**/*.test.ts']
// The glue between packages, on PGlite in `bun run test`, and on Postgres and PgBouncer (`*.postgres.test.ts`) with the
// integration tests.
const glue = 'tests/{ai,changes,comments,import,jobs,roles}/**/*.test.ts'
const postgresGlue = 'tests/{changes,jobs}/**/*.postgres.test.ts'
// The CLI building and serving the ERP on the runtime that runs Vitest, Bun or Node: `bun run test:smoke` and
// `node --run test:smoke`.
const smoke = ['tests/smoke/**/*.test.ts']
// Real Postgres beyond what every push needs: the ERP's medium seed and the planner's statistics on its million rows,
// and the job queue and event delivery through PgBouncer. `bun run test:postgres`, after `bun run test:db postgres`; CI
// runs it when SQL or the Postgres setup changes, and weekly.
const postgresSuite = ['tests/postgres/**/*.test.ts']
// The presets written out and installed with bun from npm, migrated on a tenant-style role: `bun run test:presets`.
const presets = ['packages/presets/tests/**/*.test.ts']
// Snapshot tests: what PGlite ran before, now replaying SQL recorded from real Postgres (test-support/sql-snapshot.ts),
// in `bun run test` without a database. `bun run test:record` runs them on Postgres instead and rewrites the recordings.
const recordSnapshots = process.env.SQL_SNAPSHOT === 'record'
const snapshot = ['packages/query/tests/**/*.test.ts', 'packages/server/tests/!(jobs|drain-jobs|recurring-jobs).test.ts']
// Like `mocking` for unit tests, snapshot tests that replace a module or change a global run in a registry of their own,
// and so do those that create a Better Auth instance: its rate limits live in one map per module registry, which the
// fixed clock never empties, so they would carry over from file to file.
const snapshotIsolated = [
  'packages/server/tests/app-tokens.test.ts',
  'packages/server/tests/auth-snake-case.test.ts',
  'packages/server/tests/better-auth.test.ts',
  'packages/server/tests/cors.test.ts',
  'packages/server/tests/meta.test.ts',
  'packages/server/tests/organizations.test.ts',
  'packages/server/tests/origins.test.ts',
  'packages/server/tests/passkey-domains.test.ts',
  'packages/server/tests/password-reset.integration.test.ts',
  'packages/server/tests/password-reset.test.ts',
  'packages/server/tests/platform-sign-in.integration.test.ts',
  'packages/server/tests/plugins.test.ts',
  'packages/server/tests/sign-in-codes.integration.test.ts',
  'packages/server/tests/sign-in-policy.test.ts',
  'packages/server/tests/sign-up.test.ts',
  'packages/server/tests/social-sign-in.test.ts',
  'packages/server/tests/sources.test.ts',
  'packages/server/tests/staff-sign-in.integration.test.ts',
  'packages/server/tests/webhook-table.test.ts',
]
const snapshotProject = (name: string, include: string[], exclude: string[], isolate: boolean) => ({
  extends: true,
  test: {
    name,
    include,
    exclude: [...configDefaults.exclude, ...exclude],
    // Replay connects to nothing, so a test that reaches for a database fails as a unit test does.
    setupFiles: [...(recordSnapshots ? [] : ['test-support/no-database.setup.ts']), 'test-support/sql-snapshot/setup.ts'],
    globalSetup: ['test-support/sql-snapshot/global-setup.ts'],
    isolate,
    env: { TZ: 'UTC' },
    ...(recordSnapshots && { maxWorkers: integrationWorkers }),
  },
})
// Chromium against an app served over TLS on more than one hostname, on PGlite: `bun run test:e2e`.
const e2e = ['tests/e2e/**/*.test.ts']
// Subprocesses and Postgres connections, so fewer files at once than the default. With other projects in the same run
// (an example's `bun run test`), they go after them: Vitest runs projects of different maxWorkers in separate groups.
const integrationWorkers = 4
const integrationGroup = { groupOrder: 1 }

export default defineConfig({
  test: {
    environment: 'node',
    passWithNoTests: true,
    projects: [
      {
        // `bun run test:unit` runs this and unit-isolated: only the tests next to the code; starting PGlite or a Postgres
        // client there throws.
        extends: true,
        test: {
          name: 'unit',
          include: unit,
          exclude: [...configDefaults.exclude, ...mocking],
          setupFiles: ['test-support/no-database.setup.ts'],
          isolate: false,
        },
      },
      {
        extends: true,
        test: {
          name: 'unit-isolated',
          include: mocking,
          setupFiles: ['test-support/no-database.setup.ts'],
        },
      },
      {
        // `bun run test` runs this and unit: PGlite, but no Postgres server, subprocess or network.
        extends: true,
        test: {
          name: 'pglite',
          include: ['packages/*/tests/**/*.test.ts', glue],
          exclude: [...configDefaults.exclude, ...integration, ...presets, postgresGlue, ...snapshot],
          globalSetup: ['test-support/pglite-snapshots.global-setup.ts'],
        },
      },
      snapshotProject('snapshot', snapshot, snapshotIsolated, false),
      snapshotProject('snapshot-isolated', snapshotIsolated, [], true),
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/examples/erp/**/*.test.ts', ...integration, ...smoke, postgresGlue],
          globalSetup: [testDatabase],
          env: runEnvironment('erp', runId),
          maxWorkers: integrationWorkers,
          sequence: integrationGroup,
        },
      },
      {
        extends: true,
        test: {
          name: 'integration-real-estate',
          include: ['tests/examples/real-estate/**/*.test.ts'],
          globalSetup: [testDatabase],
          env: runEnvironment('realEstate', runId),
          maxWorkers: integrationWorkers,
          sequence: integrationGroup,
        },
      },
      {
        extends: true,
        test: {
          name: 'integration-property-portal',
          include: ['tests/examples/property-portal/**/*.test.ts'],
          globalSetup: [testDatabase],
          env: runEnvironment('propertyPortal', runId),
          maxWorkers: integrationWorkers,
          sequence: integrationGroup,
        },
      },
      {
        extends: true,
        test: {
          name: 'postgres',
          include: postgresSuite,
          globalSetup: [testDatabase],
          env: runEnvironment('erpMedium', runId),
          maxWorkers: integrationWorkers,
          sequence: integrationGroup,
        },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          include: e2e,
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'presets',
          include: presets,
          testTimeout: 300_000,
          hookTimeout: 300_000,
        },
      },
    ],
  },
})
