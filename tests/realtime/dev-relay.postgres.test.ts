import { spawn, type ChildProcess } from 'node:child_process'
import { cp, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { captureSchemaSql, createUser, jobsSchemaSql, neededModules, relayMigration } from '@protobase/server'
import { createAuth } from '@protobase/server/internal'
import { run } from '../../packages/cli/tests/support/auth-project'
import { recordModules } from '../../packages/cli/tests/support/recorded-modules'
import { npmWs } from '../../packages/server/tests/support/npm-ws'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../test-support/postgres-database'
import * as resources from './app/config'

// protobase dev with `realtime.relay` and no url, on a clone of the auth template: it starts the Protobase Realtime
// release it downloads, a signed-in member takes a ticket, joins their conversation over the relay's socket and hears
// the change notice of a message they write.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 180_000 })

const root = path.resolve(__dirname, '../..')
const bin = path.join(root, 'packages/cli/bin/protobase-source.mjs')
const secret = 'dev-relay-test-secret-dev-relay-test-secret'
const password = 'correct horse battery'
const channels = { conversations: { members: { resource: 'conversation_members', channel: 'conversation_id', user: 'user_id' } } }
const tables = `
create table conversations (id integer generated always as identity primary key, title text not null);
create table conversation_members (id integer generated always as identity primary key, conversation_id integer not null references conversations, user_id text not null);
create index on conversation_members (conversation_id);
create index on conversation_members (user_id);
create table messages (id integer generated always as identity primary key, conversation_id integer not null references conversations, body text not null);
create index on messages (conversation_id);
`

const freePort = () =>
  new Promise<number>((resolve) => {
    const server = createServer().listen(0, () => {
      const { port } = server.address() as { port: number }
      server.close(() => resolve(port))
    })
  })

describe.skipIf(!(await postgresTemplateReady('auth')))('protobase dev with a relay of its own', () => {
  let database: PostgresDatabase
  let projectDir: string
  let dev: ChildProcess
  let base: string
  let user: string

  beforeAll(async () => {
    database = await openPostgresDatabase('auth')
    // The app has organizations off, so its store holds none, as one where they were never on: the template's default
    // organization would pin it to one (`pinnedOrganization`).
    await database.exec('delete from organization')
    const auth = createAuth({ database: { dialect: database.dialect, type: 'postgres' }, baseURL: 'http://localhost', secret, mailer: false })
    user = String((await createUser(auth, { email: 'dev@example.com', name: 'dev', password, role: 'admin' })).id)
    const models = Object.values(resources).map((entry) => entry.toModel())
    await database.exec(jobsSchemaSql())
    await database.exec(tables)
    await database.exec(captureSchemaSql(models))
    await database.exec((await relayMigration(database.db, auth, false, channels, models))!)
    await database.exec(`insert into conversations (title) values ('general'); insert into conversation_members (conversation_id, user_id) values (1, '${user}');`)

    // A copy of the app, since protobase dev writes its snapshot and state into the project.
    projectDir = await mkdtemp(path.join(tmpdir(), 'protobase-dev-relay-'))
    await cp(path.join(__dirname, 'app'), projectDir, { recursive: true })
    // The app's own `protobase auth migration` records the template's store in the record of migrations, which dev reads.
    const env = { DATABASE_URL: database.url, PROTOBASE_SECRET: secret }
    const recorded = await run([bin, 'auth', 'migration'], projectDir, env)
    if (recorded.status !== 0) throw new Error(`protobase auth migration failed:\n${recorded.stderr}`)
    const migrations = path.join(projectDir, 'db/migrations')
    for (const file of await readdir(migrations)) await database.exec(await readFile(path.join(migrations, file), 'utf8'))
    // The jobs schema and change capture made above, as a migration of the app would record them.
    await recordModules(database.db, neededModules({ models, views: [], jobs: [], signIn: true, realtime: { relay: { channels } } }))
    const port = await freePort()
    base = `http://localhost:${port}`
    dev = spawn(process.execPath, [bin, 'dev', '--port', String(port), '--cache-dir', path.join(projectDir, '.vite-cache')], {
      cwd: projectDir,
      env: { ...process.env, ...env },
    })
    await new Promise<void>((resolve, reject) => {
      let output = ''
      const collect = (chunk: Buffer) => {
        output += chunk
        if (output.includes('protobase dev ready')) resolve()
      }
      dev.stdout?.on('data', collect)
      dev.stderr?.on('data', collect)
      dev.once('exit', (code) => reject(new Error(`protobase dev exited with ${code}:\n${output}`)))
    })
  })

  afterAll(async () => {
    if (dev && dev.exitCode === null) {
      const exited = new Promise((resolve) => dev.once('exit', resolve))
      dev.kill('SIGTERM')
      await exited
    }
    if (projectDir) await rm(projectDir, { recursive: true, force: true })
    await database?.close()
  })

  it("delivers the change notice of a member's message to their socket on the relay", async () => {
    const headers = { 'content-type': 'application/json', origin: base }
    const signedIn = await fetch(`${base}/api/auth/sign-in/email`, { method: 'POST', headers, body: JSON.stringify({ email: 'dev@example.com', password }) })
    expect(signedIn.status).toBe(200)
    const cookie = signedIn.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ')
    const { token } = (await (await fetch(`${base}/api/auth/token`, { headers: { origin: base, cookie } })).json()) as { token: string }
    const signedHeaders = { ...headers, authorization: `Bearer ${token}` }

    const answer = await fetch(`${base}/api/relay/ticket`, { method: 'POST', headers: signedHeaders, body: '{}' })
    expect(answer.status).toBe(200)
    const { ticket, url } = (await answer.json()) as { ticket: string; url: string }

    const socket = new npmWs.WebSocket(`${url}/websocket?vsn=2.0.0&ticket=${encodeURIComponent(ticket)}`, { headers: { origin: base } })
    const frames: [string | null, string | null, string, string, Record<string, unknown>][] = []
    socket.on('message', (data) => frames.push(JSON.parse(String(data))))
    await new Promise((resolve, reject) => (socket.once('open', resolve), socket.once('error', reject)))
    socket.send(JSON.stringify(['1', '1', 'conversations/1', 'phx_join', {}]))
    await vi.waitFor(() => expect(frames.find((frame) => frame[1] === '1')?.[4]).toMatchObject({ status: 'ok' }))

    const written = await fetch(`${base}/api/v1/messages`, { method: 'POST', headers: signedHeaders, body: JSON.stringify({ conversation_id: 1, body: 'hi' }) })
    expect(written.status).toBe(201)
    const { id } = (await written.json()) as { id: number }
    await vi.waitFor(() => expect(frames.filter((frame) => frame[3] === 'change').map((frame) => frame[4])).toContainEqual(expect.objectContaining({ resource: 'messages', key: String(id), channel: 'conversations/1' })), { timeout: 20_000, interval: 200 })
    socket.close()
  })
})
