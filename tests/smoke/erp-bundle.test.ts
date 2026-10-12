import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bin, root, run } from '../../packages/cli/tests/support/auth-project'
import { databaseReachable, freePort, testDatabaseUrl } from '../../packages/cli/tests/support/database'
import { createErpDatabase, sendPastDueInvoice, signIn, stopProcess, untilListening, untilPrinted } from '../../packages/cli/tests/support/serve-process'

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
  let store: Awaited<ReturnType<typeof createErpDatabase>>
  let child: ChildProcess | undefined

  beforeAll(async () => {
    port = await freePort()
    base = `http://localhost:${port}`
    store = await createErpDatabase({ url, erpDir, base, email, password })
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

  // Serves the bundle, calls the ERP's API function, has its worker run a job, reads /api/meta as an admin and stops it again.
  const serveMeta = async (name: string) => {
    child = spawn(process.execPath, [bin, 'serve', path.join(outDir, name)], { cwd: erpDir, env: { ...process.env, ...store.env, PORT: String(port) } })
    try {
      await untilListening(child, timeout - 10_000)
      const token = await signIn(base, email, password)
      const unpaid = await fetch(`${base}/api/functions/unpaid-orders`, { headers: { authorization: `Bearer ${token}` } })
      expect(unpaid.status).toBe(200)
      expect(await unpaid.json()).toEqual({ orders: expect.any(Array) })
      expect((await fetch(`${base}/api/functions/unpaid-orders`)).status).toBe(401)
      expect(await sendPastDueInvoice(base, token, store.env.DATABASE_URL)).toBe('overdue')
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

  // A server with a shell of its own serves that for the shell's paths, and the bundle's plugins and API beside it.
  it("serves its own shell from PROTOBASE_SHELL, with the bundle's own UI as the plugin /meta names", async () => {
    await build('shell')
    const shellDir = path.join(outDir, 'own-shell')
    const shell = await run([bin, 'build-shell', shellDir], erpDir, store.env)
    if (shell.status !== 0) throw new Error(`protobase build-shell failed:\n${shell.stderr}`)
    const index = path.join(shellDir, 'index.html')
    await writeFile(index, (await readFile(index, 'utf8')).replace('<title>Protobase</title>', '<title>Own shell 5e2a</title>'))
    let output = ''
    child = spawn(process.execPath, [bin, 'serve', path.join(outDir, 'shell')], { cwd: erpDir, env: { ...process.env, ...store.env, PORT: String(port), PROTOBASE_SHELL: shellDir } })
    child.stdout?.on('data', (chunk) => (output += chunk))
    try {
      await untilListening(child, timeout - 10_000)
      for (const pathname of ['/', '/orders/42']) expect(await (await fetch(`${base}${pathname}`, { headers: { accept: 'text/html' } })).text()).toContain('Own shell 5e2a')
      const plugin = await fetch(`${base}/plugins/app/plugin.json`)
      expect(plugin.status).toBe(200)
      expect(await plugin.json()).toMatchObject({ name: 'app', entry: expect.stringMatching(/^assets\/index-[\w-]+\.js$/) })
      const token = await signIn(base, email, password)
      const meta = await (await fetch(`${base}/api/meta`, { headers: { authorization: `Bearer ${token}` } })).json()
      expect(meta.plugins).toEqual([{ url: '/plugins/app/plugin.json' }])
      expect(output).toContain(`app      the app of Protobase`)
    } finally {
      await stopProcess(child)
    }
  }, timeout)

  // The jobs in a process of their own: `serve` with PROTOBASE_JOBS=off only enqueues them, `protobase worker` runs them.
  it('runs the jobs in protobase worker beside a serve that only enqueues them', async () => {
    await build('worker')
    const worker = spawn(process.execPath, [bin, 'worker', path.join(outDir, 'worker')], { cwd: erpDir, env: { ...process.env, ...store.env } })
    child = spawn(process.execPath, [bin, 'serve', path.join(outDir, 'worker')], { cwd: erpDir, env: { ...process.env, ...store.env, PORT: String(port), PROTOBASE_JOBS: 'off' } })
    try {
      await Promise.all([untilListening(child, timeout - 10_000), untilPrinted(worker, 'protobase worker running 2 jobs', timeout - 10_000)])
      const token = await signIn(base, email, password)
      expect(await sendPastDueInvoice(base, token, store.env.DATABASE_URL)).toBe('overdue')
      // The nightly sweep waits as its next run, which the worker enqueued.
      const sql = postgres(store.env.DATABASE_URL, { max: 1, onnotice: () => {} })
      const runs = await sql`select start_after from jobs.job where name = 'mark-overdue-invoices' and state = 'created'`
      await sql.end()
      expect(runs).toHaveLength(1)
      expect(new Date(runs[0]!.start_after).getTime()).toBeGreaterThan(Date.now())
    } finally {
      await Promise.all([stopProcess(child), stopProcess(worker)])
    }
  }, timeout)
})
