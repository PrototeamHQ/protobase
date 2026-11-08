import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bin, root, run } from '../support/auth-project'
import { databaseReachable, freePort, testDatabaseUrl } from '../support/database'
import { serveOnFreePort, stopProcess, untilPrinted, withDatabase } from '../support/serve-process'

const url = testDatabaseUrl()
const reachable = await databaseReachable(url)
const hasApp = existsSync(path.join(root, 'packages/ui/src/app/main.tsx'))
const suffix = randomBytes(4).toString('hex')
const database = `protobase_previous_schema_${suffix}`
// A role that reads everything and changes nothing: every transaction it opens is read-only.
const reader = `protobase_reader_${suffix}`
// Inside tests/apps/erp, so the project resolves the same packages.
const projectDir = path.join(root, 'tests/apps/erp', `.previous-schema-${suffix}`)
const ownerUrl = withDatabase(url, database)
const readerUrl = (() => {
  const next = new URL(ownerUrl)
  next.username = reader
  next.password = reader
  return next.toString()
})()
const maintenance = () => postgres(withDatabase(url, 'postgres'), { max: 1, onnotice: () => {} })

// The CLI's subprocesses start slowly on a busy machine.
const timeout = 180_000

// Sign-in off, and an authenticator that lets everyone in as one admin, so no request writes a session.
const configFile = "export default { auth: false, url: 'http://localhost:1', webhooks: {} }\n"
const authenticateFile = "export default () => ({ user: { id: 'ann', roles: ['admin'] } })\n"
const ownerRolesFile = "export default async () => ['admin']\n"
const resourcesFile = `import { f, resource } from '@protobase/schema'
const anyone = () => true
export const notes = resource('notes')
  .table('notes')
  .fields({ id: f.integer().readOnly(), body: f.text() })
  .primaryKey((r) => r.id)
  .access({ list: anyone, read: anyone, create: anyone, update: anyone, delete: anyone })
  .events((e) => e.crud())
  .history()
  .comments()
`

// What this version's migration writes that Protobase 0.66.6 did not: indexes of Activity, Comments and the webhook
// subscriptions, and the webhooks functions' version.
const previousShape = `
  drop index changes.history_record_key, changes.history_operation, changes.history_actor, changes.history_database_role, changes.history_transaction;
  drop index comments.comments_record_key;
  drop index webhooks.subscriptions_owner, webhooks.subscriptions_created_at, webhooks.subscriptions_name, webhooks.subscriptions_enabled,
    webhooks.subscriptions_last_success_at, webhooks.subscriptions_name_search, webhooks.subscriptions_url_search;
  comment on function webhooks.subscription_commands() is 'Protobase webhooks 1';
  comment on function webhooks.deliveries_resend() is 'Protobase webhooks 1';
`

// Every schema the app's database has, which the reader may read and nothing more.
const readerSql = (schemas: string[]) => `
  create role ${reader} login password '${reader}';
  alter role ${reader} set default_transaction_read_only = on;
  grant connect on database ${database} to ${reader};
  ${schemas.map((schema) => `grant usage on schema ${schema} to ${reader}; grant select on all tables in schema ${schema} to ${reader};`).join('\n  ')}
`

// Writes the project's migrations with `protobase migration` and applies them in one transaction, as its migrate step does.
const migrate = async () => {
  const written = await run([bin, 'migration'], projectDir, { DATABASE_URL: ownerUrl })
  if (written.status !== 0) throw new Error(`protobase migration failed:\n${written.stderr}`)
  const dir = path.join(projectDir, 'db/migrations')
  const sql = postgres(ownerUrl, { max: 1, onnotice: () => {} })
  await sql.begin(async (tx) => {
    for (const file of (await readdir(dir)).sort()) await tx.unsafe(await readFile(path.join(dir, file), 'utf8'))
  })
  await sql.end()
}

const commentsOf = (base: string) => `${base}/api/v1/notes/1:comments`
const readComments = async (base: string) => {
  const response = await fetch(commentsOf(base))
  if (!response.ok) throw new Error(`reading the comments answered ${response.status}: ${await response.text()}`)
  return ((await response.json()) as { items: { body: string }[] }).items.map((item) => item.body)
}
const writeComment = async (base: string, body: string) => {
  const response = await fetch(commentsOf(base), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body }) })
  if (!response.ok) throw new Error(`writing a comment answered ${response.status}: ${await response.text()}`)
}

// Starts `protobase dev` on the database at `databaseUrl` with `args`, hands the test its address, and stops it after.
const withDev = async (databaseUrl: string, args: string[], test: (base: string) => Promise<void>) => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'protobase-dev-cache-'))
  const port = await freePort()
  const child = spawn(process.execPath, [bin, 'dev', '--port', String(port), '--cache-dir', cacheDir, ...args], { cwd: projectDir, env: { ...process.env, DATABASE_URL: databaseUrl } })
  try {
    await untilPrinted(child, 'protobase dev ready', timeout - 30_000)
    await test(`http://localhost:${port}`)
  } finally {
    await stopProcess(child)
    await rm(cacheDir, { recursive: true, force: true })
  }
}

// Serves the project's build on the database at `databaseUrl` with `env`, hands the test its address, and stops it after.
const withServe = async (databaseUrl: string, env: Record<string, string>, test: (base: string) => Promise<void>) => {
  let child: ChildProcess | undefined
  try {
    const served = await serveOnFreePort((port) => {
      child = spawn(process.execPath, [bin, 'serve', 'dist'], { cwd: projectDir, env: { ...process.env, ...env, DATABASE_URL: databaseUrl, PORT: String(port) } })
      return child
    }, timeout - 30_000)
    await test(served.base)
  } finally {
    await stopProcess(child)
  }
}

// An app migrated on Protobase 0.66.6, its schema owned by the app, starts on this version with no migration: a database
// that only lets it read proves it changes nothing as it starts and serves reads.
describe.skipIf(!reachable || !hasApp)('a database migrated by the previous release', () => {
  beforeAll(async () => {
    const sql = maintenance()
    await sql.unsafe(`create database ${database}`)
    await sql.end()
    const owner = postgres(ownerUrl, { max: 1, onnotice: () => {} })
    await owner.unsafe('create table notes (id integer generated always as identity primary key, body text not null); insert into notes (body) values (\'A note\')')
    await owner.end()
    await mkdir(path.join(projectDir, 'config'), { recursive: true })
    await mkdir(path.join(projectDir, 'auth'), { recursive: true })
    await mkdir(path.join(projectDir, 'webhooks'), { recursive: true })
    await writeFile(path.join(projectDir, 'webhooks/owner-roles.ts'), ownerRolesFile)
    await writeFile(path.join(projectDir, 'protobase.config.ts'), configFile)
    await writeFile(path.join(projectDir, 'auth/authenticate.ts'), authenticateFile)
    await writeFile(path.join(projectDir, 'config/index.ts'), resourcesFile)
    await migrate()
    const shaped = postgres(ownerUrl, { max: 1, onnotice: () => {} })
    await shaped.unsafe(previousShape)
    await shaped.unsafe(readerSql(['public', 'jobs', 'changes', 'comments', 'webhooks']))
    await shaped.end()
    const built = await run([bin, 'build', '--out', 'dist'], projectDir, {})
    if (built.status !== 0) throw new Error(`protobase build failed:\n${built.stderr}`)
  }, timeout)

  afterAll(async () => {
    await rm(projectDir, { recursive: true, force: true })
    const sql = maintenance()
    await sql.unsafe(`drop database if exists ${database} with (force)`)
    await sql.unsafe(`drop role if exists ${reader}`)
    await sql.end()
  }, 60_000)

  it('starts under protobase dev, whose comments read and write', async () => {
    await withDev(ownerUrl, [], async (base) => {
      await writeComment(base, 'Written under dev')
      expect(await readComments(base)).toEqual(['Written under dev'])
    })
  }, timeout)

  it('starts under protobase serve, whose comments read and write', async () => {
    await withServe(ownerUrl, {}, async (base) => {
      await writeComment(base, 'Written under serve')
      expect(await readComments(base)).toEqual(['Written under serve', 'Written under dev'])
    })
  }, timeout)

  // Running jobs writes as it claims them, which is the jobs' own work rather than a change to the schema: the reader
  // runs none, as a `protobase worker` beside it would.
  it('starts under protobase dev and serves reads with a role that cannot change anything', async () => {
    await withDev(readerUrl, ['--no-jobs'], async (base) => {
      expect(await readComments(base)).toEqual(['Written under serve', 'Written under dev'])
    })
  }, timeout)

  it('starts under protobase serve and serves reads with a role that cannot change anything', async () => {
    await withServe(readerUrl, { PROTOBASE_JOBS: 'false' }, async (base) => {
      expect(await readComments(base)).toEqual(['Written under serve', 'Written under dev'])
    })
  }, timeout)

  it('fails protobase doctor on the indexes added since, which the next migration writes', async () => {
    const doctor = await run([bin, 'doctor'], projectDir, { DATABASE_URL: ownerUrl })
    expect(doctor.stdout).toContain('error   webhook_subscriptions: no index serves the column "created_at"')
    expect(doctor.stdout).toContain('protobase migration')
    expect(doctor.status).toBe(1)
  }, timeout)
})
