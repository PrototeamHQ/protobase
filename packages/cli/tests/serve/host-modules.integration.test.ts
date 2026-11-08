import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { manifestFile } from '../../src/bundle/manifest'
import { protobaseVersion } from '../../src/version/version'
import { bin } from '../support/auth-project'
import { databaseReachable, testDatabaseUrl } from '../support/database'
import { serveOnFreePort, stopProcess } from '../support/serve-process'

const url = testDatabaseUrl()
const reachable = await databaseReachable(url)
const timeout = 60_000

// A config module as `protobase build` writes it, importing two host modules, with two public functions: `teapot`
// throws hono's HTTPException(418) and `missing` throws notFound().
const configModule = `import { HTTPException } from 'hono/http-exception'
import { notFound } from '@protobase/server'
const fn = (handler) => async () => ({ default: { kind: 'function', options: { public: true }, handler } })
export const own = {
  config: { auth: false },
  label: 'protobase.config.ts',
  files: {
    functions: { teapot: fn(() => { throw new HTTPException(418) }), missing: fn(() => { throw notFound('no such thing') }) },
    modules: { 'auth/authenticate.ts': async () => ({ default: async () => null }) },
  },
}
export const extensions = []
export const packages = {}
`

// Second copies of the host modules the bundle imports: their errors are not the CLI's classes.
const stubs = {
  '@protobase/server': 'export class HttpProblem extends Error { status = 404 }\nexport const notFound = (detail) => new HttpProblem(detail)\n',
  hono: 'export {}\n',
}
const stubExports: Record<string, Record<string, string>> = {
  '@protobase/server': { '.': './index.js' },
  hono: { '.': './index.js', './http-exception': './http-exception.js' },
}
const honoException = 'export class HTTPException extends Error { constructor(status) { super(); this.status = status } }\n'

// A project folder outside the repository, with the bundle in it; an empty node_modules there keeps Bun from installing.
const folders: string[] = []
const createProject = async (withStubs: boolean) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'protobase-host-modules-'))
  folders.push(dir)
  const bundle = path.join(dir, 'dist')
  await mkdir(bundle, { recursive: true })
  const shell = { protobase: protobaseVersion, pluginApi: 1, paths: ['/index.html'] }
  const manifest = { version: 3, protobase: protobaseVersion, server: 'protobase.config.js', public: 'public', spa: 'index.html', api: ['/api'], plugins: [], theme: 'protobase.theme.css', shell }
  await writeFile(path.join(bundle, manifestFile), JSON.stringify(manifest))
  await writeFile(path.join(bundle, 'protobase.config.js'), configModule)
  await mkdir(path.join(dir, 'node_modules'))
  if (!withStubs) return bundle
  for (const [name, code] of Object.entries(stubs)) {
    const packageDir = path.join(dir, 'node_modules', name)
    await mkdir(packageDir, { recursive: true })
    await writeFile(path.join(packageDir, 'package.json'), JSON.stringify({ name, version: '0.0.1', type: 'module', exports: stubExports[name] }))
    await writeFile(path.join(packageDir, 'index.js'), code)
  }
  await writeFile(path.join(dir, 'node_modules/hono/http-exception.js'), honoException)
  return bundle
}

let child: ChildProcess | undefined
afterEach(async () => {
  await stopProcess(child)
  await Promise.all(folders.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

// `protobase serve` under Bun, from the project folder, as a self-hosted server runs it.
const serve = async (bundle: string) => {
  const served = await serveOnFreePort((port) => {
    child = spawn('bun', [bin, 'serve', path.join(bundle, 'protobase.config.js')], {
      cwd: path.dirname(bundle),
      env: { PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_URL: url, PROTOBASE_STARTUP_CHECKS: 'false', PORT: String(port), PROTOBASE_URL: `http://localhost:${port}` },
    })
    return child
  }, timeout - 10_000)
  return served.base
}

const statuses = async (base: string) => ({
  teapot: (await fetch(`${base}/api/functions/teapot`)).status,
  missing: (await fetch(`${base}/api/functions/missing`)).status,
})

describe.skipIf(!reachable)("protobase serve under Bun gives a bundle the CLI's own host modules", () => {
  it('serves a bundle whose project installed none of them', async () => {
    expect(await statuses(await serve(await createProject(false)))).toEqual({ teapot: 418, missing: 404 })
  }, timeout)

  it("serves a bundle with the CLI's copies when the project holds other ones", async () => {
    expect(await statuses(await serve(await createProject(true)))).toEqual({ teapot: 418, missing: 404 })
  }, timeout)
})
