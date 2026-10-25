import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { databaseReachable, testDatabaseUrl } from '../support/database'
import { root, run } from '../support/auth-project'

const url = testDatabaseUrl()
const reachable = await databaseReachable(url)

const exitCheck = path.join(root, 'packages/cli/tests/support/exit-check.mjs')
const erp = path.join(root, 'examples/erp')
const env = { DATABASE_URL: url, BETTER_AUTH_SECRET: 'command-exit-test-secret-0123456789abcdef' }

// The commands Cloud runs on every deploy, in the ERP, whose Better Auth store shares the app's pool and checks its
// schema at startup: each exits once its work is done, also when it sends no query of its own.
describe.skipIf(!reachable)('a command over a project', () => {
  it.each([
    ['encryption status'],
    ['encryption apply'],
    ['doctor --env DATABASE_URL'],
    ['users list'],
  ])('%s exits when it is done', async (command) => {
    const result = await run([exitCheck, ...command.split(' ')], erp, env)
    expect(result.stderr).not.toContain('still running')
    expect(result.status).not.toBe(124)
  }, 60_000)
})
