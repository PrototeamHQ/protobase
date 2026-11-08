import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import pg from 'pg'
import postgres from 'postgres'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { jobsSchemaMigration } from '@protobase/server'
import { manifestFile } from '../../src/bundle/manifest'
import { protobaseVersion } from '../../src/version/version'
import { openAppDatabase } from '../../src/project/pg-db'
import { bin } from '../support/auth-project'
import { databaseReachable, testDatabaseUrl } from '../support/database'
import { stopProcess, untilPrinted, withDatabase } from '../support/serve-process'

const url = testDatabaseUrl()
const reachable = await databaseReachable(url)
const timeout = 60_000

// A config module as `protobase build` writes it, with one job that imports two host modules and throws a
// FatalJobError; a retry waits an hour, so a retried job stays in the `retry` state.
const configModule = `export const own = {
  config: { auth: false, jobs: { fatal_job: { retryDelay: '1 hour' } } },
  label: 'protobase.config.ts',
  files: { functions: {}, modules: { 'jobs/fatal_job.ts': () => import('./fatal-job.js'), 'auth/authenticate.ts': async () => ({ default: async () => null }) } },
}
export const extensions = []
export const packages = {}
`
const jobModule = `import { HTTPException } from 'hono/http-exception'
import { FatalJobError } from '@protobase/server'
export default () => { throw new FatalJobError(String(new HTTPException(418).status)) }
`

// Second copies of the host modules the job imports: their FatalJobError is not the CLI's class.
const stubs = {
  '@protobase/server': 'export class FatalJobError extends Error {}\n',
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
  const dir = await mkdtemp(path.join(tmpdir(), 'protobase-worker-host-modules-'))
  folders.push(dir)
  const bundle = path.join(dir, 'dist')
  await mkdir(bundle, { recursive: true })
  const shell = { protobase: protobaseVersion, pluginApi: 1, paths: ['/index.html'] }
  const manifest = { version: 3, protobase: protobaseVersion, server: 'protobase.config.js', public: 'public', spa: 'index.html', api: ['/api'], plugins: [], theme: 'protobase.theme.css', shell }
  await writeFile(path.join(bundle, manifestFile), JSON.stringify(manifest))
  await writeFile(path.join(bundle, 'protobase.config.js'), configModule)
  await writeFile(path.join(bundle, 'fatal-job.js'), jobModule)
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

// A database of the test's own with the jobs schema, as `protobase migrate` leaves it.
const databases: string[] = []
const maintenance = () => postgres(withDatabase(url, 'postgres'), { max: 1, onnotice: () => {} })
const createDatabase = async () => {
  const name = `protobase_worker_host_modules_${randomBytes(4).toString('hex')}`
  const admin = maintenance()
  await admin.unsafe(`create database ${name}`)
  await admin.end()
  databases.push(name)
  const databaseUrl = withDatabase(url, name)
  const { db } = openAppDatabase(pg, databaseUrl, 1)
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} })
  await sql.unsafe((await jobsSchemaMigration(db))!)
  await db.destroy()
  return { databaseUrl, sql }
}

let child: ChildProcess | undefined
afterEach(async () => {
  await stopProcess(child)
  await Promise.all(folders.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  const admin = maintenance()
  for (const name of databases.splice(0)) await admin.unsafe(`drop database if exists ${name} with (force)`)
  await admin.end()
})

// `protobase worker` under Bun, from the project folder, as a self-hosted server runs it beside `serve`; resolves with
// the state and retry count the job ends its first try with.
const runFatalJob = async (bundle: string) => {
  const { databaseUrl, sql } = await createDatabase()
  child = spawn('bun', [bin, 'worker', bundle], {
    cwd: path.dirname(bundle),
    env: { PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_URL: databaseUrl, PROTOBASE_STARTUP_CHECKS: 'false' },
  })
  await untilPrinted(child, 'protobase worker running 1 job', timeout - 20_000)
  await sql`select jobs.enqueue('fatal_job')`
  const ended = await vi.waitFor(async () => {
    const [job] = await sql<{ state: string; retry_count: number }[]>`select state, retry_count from jobs.job where name = 'fatal_job'`
    if (!job || !['failed', 'retry'].includes(job.state)) throw new Error(`the job is ${job?.state ?? 'not enqueued'}`)
    return job
  }, { timeout: 15_000, interval: 200 })
  await sql.end()
  return { state: ended.state, retries: ended.retry_count }
}

describe.skipIf(!reachable)("protobase worker under Bun gives a bundle the CLI's own host modules", () => {
  it('runs a job whose project installed none of them', async () => {
    expect(await runFatalJob(await createProject(false))).toEqual({ state: 'failed', retries: 0 })
  }, timeout)

  it("ends a job as fatal with the CLI's FatalJobError when the project holds other copies", async () => {
    expect(await runFatalJob(await createProject(true))).toEqual({ state: 'failed', retries: 0 })
  }, timeout)
})
