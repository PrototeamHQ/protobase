import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { copyFile, cp, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bin, root, run } from '../support/auth-project'
import { databaseReachable, testDatabaseUrl } from '../support/database'
import { createErpDatabase, sendPastDueInvoice, serveOnFreePort, signIn, stopProcess } from '../support/serve-process'

const url = testDatabaseUrl()
const reachable = await databaseReachable(url)
const erpDir = path.join(root, 'examples/erp')

// The CLI's subprocesses start slowly on a busy machine.
const timeout = 120_000

// The ERP with its config as protobase.config.json (tests/fixtures/erp-json): a copy of the ERP's own code, which the
// conventions find, inside the ERP so it resolves the ERP's packages, with the JSON config in place of the TypeScript.
describe.skipIf(!reachable)('a project with protobase.config.json', () => {
  const projectDir = path.join(erpDir, `.json-config-${randomBytes(4).toString('hex')}`)
  const email = 'json-config@example.com'
  const password = 'a-long-test-password'
  let store: Awaited<ReturnType<typeof createErpDatabase>>
  let child: ChildProcess | undefined

  beforeAll(async () => {
    const skipped = new Set(['node_modules', 'dist', 'protobase.config.ts'])
    for (const entry of await readdir(erpDir)) {
      if (!skipped.has(entry) && !entry.startsWith('.')) await cp(path.join(erpDir, entry), path.join(projectDir, entry), { recursive: true })
    }
    await copyFile(path.join(root, 'packages/cli/tests/fixtures/erp-json/protobase.config.json'), path.join(projectDir, 'protobase.config.json'))
    store = await createErpDatabase({ url, erpDir, base: 'http://localhost', email, password })
  }, timeout)

  afterAll(async () => {
    await stopProcess(child)
    await rm(projectDir, { recursive: true, force: true })
    await store?.dispose()
  }, 60_000)

  it('is built and served as the TypeScript config is: sign-in with its hooks, its API function, its write hook and job', async () => {
    const built = await run([bin, 'build', '--out', 'dist'], projectDir, store.env)
    if (built.status !== 0) throw new Error(`protobase build failed:\n${built.stderr}`)
    const served = await serveOnFreePort((port) => {
      child = spawn(process.execPath, [bin, 'serve', 'dist'], { cwd: projectDir, env: { ...process.env, ...store.env, PORT: String(port), PROTOBASE_URL: `http://localhost:${port}` } })
      return child
    }, timeout - 10_000)
    try {
      const token = await signIn(served.base, email, password)
      const unpaid = await fetch(`${served.base}/api/functions/unpaid-orders`, { headers: { authorization: `Bearer ${token}` } })
      expect(unpaid.status).toBe(200)
      // The write hook (hooks/schedule-overdue-check.ts) enqueues the declared job, whose run (jobs/<name>.ts) marks it.
      expect(await sendPastDueInvoice(served.base, token, store.env.DATABASE_URL)).toBe('overdue')
    } finally {
      await stopProcess(child)
    }
  }, timeout)
})
