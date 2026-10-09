import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildServeRuntime } from '../../src/build/serve-runtime'
import { bin, root, run } from '../support/auth-project'
import { databaseReachable, freePort, testDatabaseUrl } from '../support/database'
import { createErpAuthStore, signIn, stopProcess, untilListening } from '../support/serve-process'
import { protobaseVersion } from '../../src/version/version'

const url = testDatabaseUrl()
const erpDir = path.join(root, 'examples/erp')
const hasBun = spawnSync('bun', ['--version']).status === 0
const reachable = await databaseReachable(url)

// Building the bundle and the runtime, migrating the auth store and starting Bun are slow under load.
const startupTimeout = 120_000

// The production path: the config module of the ERP bundle served by the runtime under `bun --no-install`, from a
// folder without node_modules, with only the environment a platform would pass. The runtime serves the API alone.
describe.skipIf(!reachable || !hasBun)('the ERP bundle served by protobase-serve.js under Bun', () => {
  let dir: string
  let child: ChildProcess
  let base: string
  let store: Awaited<ReturnType<typeof createErpAuthStore>>
  let output = ''

  beforeAll(async () => {
    const port = await freePort()
    base = `http://localhost:${port}`
    store = await createErpAuthStore({ url, erpDir, base, email: 'serve@example.com', password: 'a-long-test-password' })

    dir = await mkdtemp(path.join(tmpdir(), 'protobase-serve-'))
    const built = await run([bin, 'build', '--out', path.join(dir, 'app')], erpDir, store.env)
    if (built.status !== 0) throw new Error(`protobase build failed:\n${built.stderr}`)
    await buildServeRuntime({ outFile: path.join(dir, 'opt/protobase-serve.js') })

    child = spawn('bun', ['--no-install', 'opt/protobase-serve.js', 'app/protobase.config.js'], {
      cwd: dir,
      env: { PATH: process.env.PATH, ...store.env, PORT: String(port) },
    })
    child.stdout?.on('data', (chunk) => (output += chunk))
    child.stderr?.on('data', (chunk) => (output += chunk))
    await untilListening(child, startupTimeout - 10_000)
  }, startupTimeout)

  afterAll(async () => {
    await stopProcess(child)
    if (dir) await rm(dir, { recursive: true, force: true })
    await store?.dispose()
  }, 60_000)

  let token = ''

  it('runs from the config module of a complete bundle folder, built by its own Protobase version', async () => {
    expect(existsSync(path.join(dir, 'app/public/index.html'))).toBe(true)
    expect(JSON.parse(await readFile(path.join(dir, 'app/protobase.bundle.json'), 'utf8')).protobase).toBe(protobaseVersion)
  })

  it('refuses a bundle built by a newer minor, naming both versions', async () => {
    const [major, minor] = protobaseVersion.split('.').map(Number)
    const newer = `${major}.${minor! + 1}.0`
    await mkdir(path.join(dir, 'newer'))
    await copyFile(path.join(dir, 'app/protobase.config.js'), path.join(dir, 'newer/protobase.config.js'))
    const manifest = JSON.parse(await readFile(path.join(dir, 'app/protobase.bundle.json'), 'utf8'))
    await writeFile(path.join(dir, 'newer/protobase.bundle.json'), JSON.stringify({ ...manifest, protobase: newer }))

    const refused = spawnSync('bun', ['--no-install', 'opt/protobase-serve.js', 'newer/protobase.config.js'], {
      cwd: dir,
      env: { PATH: process.env.PATH, ...store.env, PORT: '0' },
      encoding: 'utf8',
    })
    expect(refused.status).toBe(1)
    expect(refused.stdout).toBe('')
    expect(refused.stderr).toContain(`error: newer/protobase.bundle.json: the bundle was built by Protobase ${newer} and this runtime is Protobase ${protobaseVersion}`)
    expect(refused.stderr).toContain(`rebuild the bundle with Protobase ${major}.${minor}.x or serve it with a runtime of`)
  })

  it('answers the health probe without a token', async () => {
    const response = await fetch(`${base}/health`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })

  it('signs in with Better Auth and hands out a bearer token', async () => {
    token = await signIn(base, 'serve@example.com', 'a-long-test-password')
    expect(token).toBeTruthy()
  })

  it('serves /api/meta to the token and refuses everyone else', async () => {
    const meta = await fetch(`${base}/api/meta`, { headers: { authorization: `Bearer ${token}` } })
    expect(meta.status).toBe(200)
    expect(meta.headers.get('x-meta-version')).toBeTruthy()
    expect((await meta.json()).resources).toBeDefined()
    expect((await fetch(`${base}/api/meta`)).status).toBe(401)
  })

  it('reads a resource from the ERP database', async () => {
    const response = await fetch(`${base}/api/v1/orders?page_size=1`, { headers: { authorization: `Bearer ${token}` } })
    expect(response.status).toBe(200)
    expect(Array.isArray((await response.json()).items)).toBe(true)
  })

  it('leaves the UI to the host: no index.html from the runtime', async () => {
    expect((await fetch(`${base}/`, { headers: { accept: 'text/html' } })).status).toBe(404)
  })

  it('shuts down cleanly on SIGTERM', async () => {
    const exited = new Promise<[number | null, string | null]>((resolve) => child.once('exit', (code, signal) => resolve([code, signal])))
    child.kill('SIGTERM')
    expect(await exited).toEqual([0, null])
    expect(output).not.toContain('error')
    await expect(fetch(`${base}/health`)).rejects.toThrow()
  })
})
