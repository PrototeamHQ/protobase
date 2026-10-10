import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bin, root, run } from '../../packages/cli/tests/support/auth-project'
import { databaseReachable, freePort, testDatabaseUrl } from '../../packages/cli/tests/support/database'
import { createErpAuthStore, signIn, stopProcess, untilListening } from '../../packages/cli/tests/support/serve-process'

const url = testDatabaseUrl()
const erpDir = path.join(root, 'examples/erp')
const reachable = await databaseReachable(url)
const runtime = process.versions.bun ? 'Bun' : 'Node'

// The CLI's subprocesses start slowly on a busy machine.
const timeout = 120_000

// The CLI on the runtime that runs this test (`bun run test:smoke` or `node --run test:smoke`): it builds the ERP and
// serves the bundle, and the config's non-ASCII text comes back as written. Under Bun, the same for a --bun bundle.
describe.skipIf(!reachable)(`the ERP built and served by the CLI on ${runtime}`, () => {
  // Inside the ERP, so `protobase serve` resolves the modules the bundle imports from its node_modules.
  const outDir = path.join(erpDir, `.smoke-${randomBytes(4).toString('hex')}`)
  const email = 'smoke@example.com'
  const password = 'a-long-test-password'
  let port: number
  let base: string
  let store: Awaited<ReturnType<typeof createErpAuthStore>>
  let child: ChildProcess | undefined

  beforeAll(async () => {
    port = await freePort()
    base = `http://localhost:${port}`
    store = await createErpAuthStore({ url, erpDir, base, email, password })
  }, timeout)

  afterAll(async () => {
    await stopProcess(child)
    await rm(outDir, { recursive: true, force: true })
    await store?.dispose()
  }, 60_000)

  const build = async (name: string, ...options: string[]) => {
    const built = await run([bin, 'build', '--out', path.join(outDir, name), ...options], erpDir, store.env)
    if (built.status !== 0) throw new Error(`protobase build failed:\n${built.stderr}`)
    return readFile(path.join(outDir, name, 'protobase.config.js'), 'utf8')
  }

  // Serves the bundle, reads /api/meta as an admin and stops it again.
  const serveMeta = async (name: string) => {
    child = spawn(process.execPath, [bin, 'serve', path.join(outDir, name)], { cwd: erpDir, env: { ...process.env, ...store.env, PORT: String(port) } })
    try {
      await untilListening(child, timeout - 10_000)
      const token = await signIn(base, email, password)
      const meta = await fetch(`${base}/api/meta`, { headers: { authorization: `Bearer ${token}` } })
      expect(meta.status).toBe(200)
      return JSON.stringify(await meta.json())
    } finally {
      await stopProcess(child)
    }
  }

  it('checks the config against the database', async () => {
    const checked = await run([bin, 'doctor', '--env', 'DATABASE_URL'], erpDir, store.env)
    expect(checked.stderr).toBe('')
    expect(checked.status).toBe(0)
  }, timeout)

  it("serves a plain bundle with the config's € intact", async () => {
    const code = await build('plain')
    expect(code).not.toContain('// @bun')
    expect(await serveMeta('plain')).toContain('"prefix":"€"')
  }, timeout)

  it.skipIf(!process.versions.bun)("serves a --bun bundle, written by Bun's bundler, with the config's € intact", async () => {
    const code = await build('bun', '--bun')
    expect(code.startsWith('// @bun\n')).toBe(true)
    expect(await serveMeta('bun')).toContain('"prefix":"€"')
  }, timeout)
})
