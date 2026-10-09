import { randomBytes } from 'node:crypto'
import { configDefaults, defineConfig } from 'vitest/config'
import { runEnvironment } from './scripts/test-db/templates'

// Each integration run clones its own databases from the test templates (`pnpm test:db`), named after this id, and
// drops them afterwards; DATABASE_URL points each project at its clone, never at a developer database.
const runId = randomBytes(4).toString('hex')
const testDatabase = 'scripts/test-db/global-setup.ts'
// Unit tests sit next to the code; tests that start a database, a subprocess or the network live in each package's
// tests/, and the examples' in tests/examples.
const unit = ['packages/*/src/**/*.test.ts', 'docs-examples/**/*.test.ts', 'examples/*/config/**/*.test.ts']
// Database, subprocess and build tests: `pnpm test:integration`.
const integration = ['packages/cli/tests/**/*.integration.test.ts', 'packages/cli/tests/build/deploy-bundle.test.ts']
// Subprocesses and Postgres connections, so fewer files at once than the default. With other projects in the same run
// (an example's `pnpm test`), they go after them: Vitest runs projects of different maxWorkers in separate groups.
const integrationWorkers = 4
const integrationGroup = { groupOrder: 1 }

export default defineConfig({
  test: {
    environment: 'node',
    passWithNoTests: true,
    projects: [
      {
        // `pnpm test:unit`: only the tests next to the code; starting PGlite or a Postgres client there throws.
        extends: true,
        test: {
          name: 'unit',
          include: unit,
          setupFiles: ['test-support/no-database.setup.ts'],
        },
      },
      {
        // `pnpm test` runs this and unit: PGlite, but no Postgres server, subprocess or network.
        extends: true,
        test: {
          name: 'pglite',
          include: ['packages/*/tests/**/*.test.ts'],
          exclude: [...configDefaults.exclude, ...integration],
          globalSetup: ['test-support/pglite-snapshots.global-setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/examples/erp/**/*.test.ts', ...integration],
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
    ],
  },
})
