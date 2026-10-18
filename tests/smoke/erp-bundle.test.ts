import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bin, root, run } from '../../packages/cli/tests/support/auth-project'
import { databaseReachable, freePort, testDatabaseUrl } from '../../packages/cli/tests/support/database'
import { createErpDatabase, sendPastDueInvoice, signIn, stopProcess, untilListening, untilPrinted } from '../../packages/cli/tests/support/serve-process'
import { protobaseVersion } from '../../packages/cli/src/version/version'
import { serveRuntimeScenarios } from './serve-runtime-scenarios'

const url = testDatabaseUrl()
const erpDir = path.join(root, 'examples/erp')
const reachable = await databaseReachable(url)
const runtime = process.versions.bun ? 'Bun' : 'Node'
const onBun = Boolean(process.versions.bun)

// The CLI's subprocesses start slowly on a busy machine.
const timeout = 120_000

// The CLI on the runtime that runs this test (`bun run test:smoke` or `node --run test:smoke`): it builds the ERP once,
// without a secret or a database, and serves that bundle, the config's non-ASCII text coming back as written. Under Bun
// the same bundle is also served with a shell of its own, beside a worker and by the production runtime, and a --bun
// bundle is built and served; those do not depend on the runtime the CLI runs on, so Node serves the plain bundle alone.
describe.skipIf(!reachable)(`the ERP built and served by the CLI on ${runtime}`, () => {
  // Inside the ERP, so `protobase serve` resolves the modules the bundle imports from its node_modules.
  const outDir = path.join(erpDir, `.smoke-${randomBytes(4).toString('hex')}`)
  const email = 'smoke@example.com'
  const password = 'a-long-test-password'
  let port: number
  let base: string
  let store: Awaited<ReturnType<typeof createErpDatabase>>
  let child: ChildProcess | undefined
  let plainCode: string
  let plainBuild: { status: number | null; stderr: string }

  beforeAll(async () => {
    port = await freePort()
    base = `http://localhost:${port}`
    store = await createErpDatabase({ url, erpDir, base, email, password })
    // As a platform builds it: no BETTER_AUTH_SECRET, and no database to reach.
    const env = { PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_URL: 'postgres://nobody@127.0.0.1:1/none' }
    plainBuild = spawnSync(process.execPath, [bin, 'build', '--out', path.join(outDir, 'plain')], { cwd: erpDir, env, encoding: 'utf8' })
    if (plainBuild.status !== 0) throw new Error(`protobase build failed:\n${plainBuild.stderr}`)
    plainCode = await readFile(path.join(outDir, 'plain', 'protobase.config.js'), 'utf8')
  }, timeout)

  afterAll(async () => {
    await stopProcess(child)
    await rm(outDir, { recursive: true, force: true })
    await store?.dispose()
  }, 60_000)

  // A bundle of its own, built with the database's environment.
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

  it.skipIf(!onBun)('checks the config against the database', async () => {
    const checked = await run([bin, 'doctor', '--env', 'DATABASE_URL'], erpDir, store.env)
    expect(checked.stderr).toBe('')
    expect(checked.status).toBe(0)
  }, timeout)

  it("serves a plain bundle, built without a secret or a database, with the config's € intact", async () => {
    expect(plainBuild.stderr).toBe('')
    const manifest = JSON.parse(await readFile(path.join(outDir, 'plain', 'protobase.bundle.json'), 'utf8'))
    expect(manifest.api).toEqual(['/api'])
    expect(manifest.protobase).toBe(protobaseVersion)
    expect(await readdir(path.join(outDir, 'plain', 'public/assets'))).not.toHaveLength(0)
    expect(plainCode).not.toContain('// @bun')
    expect(await serveMeta('plain')).toContain('"prefix":"€"')
  }, timeout)

  it.skipIf(!onBun)("serves a --bun bundle, written by Bun's bundler, with the config's € intact", async () => {
    const code = await build('bun', '--bun')
    expect(code.startsWith('// @bun\n')).toBe(true)
    expect(await serveMeta('bun')).toContain('"prefix":"€"')
  }, timeout)

  // A server with a shell of its own serves that for the shell's paths, and the bundle's plugins and API beside it.
  it.skipIf(!onBun)("serves its own shell from PROTOBASE_SHELL, with the bundle's own UI as the plugin /meta names", async () => {
    const shellDir = path.join(outDir, 'own-shell')
    const shell = await run([bin, 'build-shell', shellDir], erpDir, store.env)
    if (shell.status !== 0) throw new Error(`protobase build-shell failed:\n${shell.stderr}`)
    const index = path.join(shellDir, 'index.html')
    await writeFile(index, (await readFile(index, 'utf8')).replace('<title>Protobase</title>', '<title>Own shell 5e2a</title>'))
    let output = ''
    child = spawn(process.execPath, [bin, 'serve', path.join(outDir, 'plain')], { cwd: erpDir, env: { ...process.env, ...store.env, PORT: String(port), PROTOBASE_SHELL: shellDir } })
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

  // The jobs in a process of their own: `serve` with PROTOBASE_JOBS=false only enqueues them, `protobase worker` runs them.
  it.skipIf(!onBun)('runs the jobs in protobase worker beside a serve that only enqueues them', async () => {
    const worker = spawn(process.execPath, [bin, 'worker', path.join(outDir, 'plain')], { cwd: erpDir, env: { ...process.env, ...store.env } })
    child = spawn(process.execPath, [bin, 'serve', path.join(outDir, 'plain')], { cwd: erpDir, env: { ...process.env, ...store.env, PORT: String(port), PROTOBASE_JOBS: 'false' } })
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

  if (onBun) serveRuntimeScenarios(() => ({ bundle: path.join(outDir, 'plain'), env: store.env, port, email, password }))
})
