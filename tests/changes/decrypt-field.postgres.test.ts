import { randomBytes } from 'node:crypto'
import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { f, resource } from '@protobase/schema'
import { createAdmin, defineFunction, defineJob, jobsSchemaMigration, startJobs, type AuditEvent, type AuditQueue, type JobsRuntime } from '@protobase/server'
import { connectServer, databaseUrl, serverReachable } from '../../scripts/test-db/templates'

// Workers poll on real timers, which a busy machine stretches.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const reachable = await serverReachable()
const name = `decrypt_field_${randomBytes(4).toString('hex')}`
const key = Buffer.from(Array.from({ length: 32 }, (_, i) => i)).toString('base64')
const otherKey = Buffer.from(Array.from({ length: 32 }, (_, i) => 255 - i)).toString('base64')
const canary = 'SMB-PASSWORD-CANARY-0001'

// A backup target of organization 1, its password encrypted and bound to its key and tenant; its note may stay empty.
const targets = resource('targets')
  .table('targets')
  .fields({ id: f.integer().readOnly(), org_id: f.integer().readOnly(), host: f.text(), password: f.text().encrypted(), note: f.text().optional().encrypted() })
  .primaryKey((r) => r.id)
  .tenant((r) => r.org_id)

type Read = { resource: string; key: number; field: string }
type Outcome = { value: string | null } | { error: string }

const outcome = (read: () => Promise<string | null>): Promise<Outcome> => read().then((value) => ({ value }), (error: Error) => ({ error: error.message }))

afterAll(async () => {
  if (!reachable) return
  const server = connectServer()
  await server.unsafe(`drop database if exists "${name}" with (force)`)
  await server.end()
})

describe.skipIf(!reachable)('decryptField in jobs and API functions', () => {
  let pool: pg.Pool
  let db: Kysely<any>
  let runtime: JobsRuntime
  const events: AuditEvent[] = []
  const audit: AuditQueue = { publish: async (event) => void events.push(event) }
  const jobOutcomes: Outcome[] = []
  const readJob = defineJob<Read>({ name: 'read-target', maxAttempts: 1, run: async (read, context) => void jobOutcomes.push(await outcome(() => context.decryptField(read.resource, read.key, read.field))) })
  const dispatch = defineFunction(async (request, context) => {
    const query = new URL(request.url).searchParams
    return Response.json(await outcome(() => context.decryptField('targets', Number(query.get('key')), query.get('field')!)))
  })
  const authenticate = () => ({ user: { id: 'u1', roles: ['admin'] }, tenant: 1 })
  const adminWith = (encryptionKey: string, queue: AuditQueue) => {
    vi.stubEnv('PROTOBASE_ENCRYPTION_KEY', encryptionKey)
    const admin = createAdmin({ resources: [targets], db, authenticate, functions: { dispatch }, jobs: [readJob], options: { audit: queue } })
    vi.unstubAllEnvs()
    return admin
  }
  let admin: ReturnType<typeof adminWith>
  const call = (path: string, init: RequestInit = {}) =>
    admin.request(path, { ...init, headers: { 'content-type': 'application/json', 'user-agent': 'probe/1', ...init.headers } })
  const runJob = async (read: Read) => {
    const before = jobOutcomes.length
    await readJob.enqueue(db, read)
    await vi.waitFor(() => expect(jobOutcomes.length).toBe(before + 1), { timeout: 15_000, interval: 50 })
    return jobOutcomes[before]!
  }
  const lastEvent = () => events[events.length - 1]!

  beforeAll(async () => {
    const server = connectServer()
    await server.unsafe(`create database "${name}"`)
    await server.end()
    pool = new pg.Pool({ connectionString: databaseUrl(name), max: 4 })
    db = new Kysely<any>({ dialect: new PostgresDialect({ pool }) })
    await pool.query((await jobsSchemaMigration(db))!)
    await pool.query(`create table targets (id integer generated always as identity primary key, org_id integer not null default 1, host text not null, password text not null, note text)`)
    admin = adminWith(key, audit)
    expect((await call('/api/v1/targets', { method: 'POST', body: JSON.stringify({ host: 'nas.local', password: canary }) })).status).toBe(201)
    runtime = await startJobs({ db, jobs: [readJob], decryptField: admin.decryptField, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => { throw error } })
  })
  afterAll(async () => {
    await runtime?.stop()
    await db?.destroy()
  })

  it('stores only ciphertext', async () => {
    const { rows } = await pool.query('select password from targets')
    expect(rows[0].password).toMatch(/^pbenc:/)
  })

  it('lets a job read the cleartext, audited as a reveal naming the job, with neither the value nor the key in the event', async () => {
    events.length = 0
    expect(await runJob({ resource: 'targets', key: 1, field: 'password' })).toEqual({ value: canary })
    expect(events).toEqual([{ type: 'field.revealed', at: expect.any(String), reader: { job: 'read-target' }, tenant: 1, resource: 'targets', recordKey: '1', field: 'password', origin: {} }])
    const text = JSON.stringify(events)
    expect(text).not.toContain(canary)
    expect(text).not.toContain(key)
  })

  it('lets a protected API function read the cleartext, audited naming the function, its caller and the request', async () => {
    events.length = 0
    const response = await call('/api/functions/dispatch?key=1&field=password')
    expect(await response.json()).toEqual({ value: canary })
    expect(events).toEqual([{
      type: 'field.revealed',
      at: expect.any(String),
      actor: { id: 'u1', roles: ['admin'] },
      reader: { function: 'dispatch' },
      tenant: 1,
      resource: 'targets',
      recordKey: '1',
      field: 'password',
      origin: { userAgent: 'probe/1' },
    }])
  })

  it('gives an empty encrypted field as null, audited too', async () => {
    events.length = 0
    expect(await runJob({ resource: 'targets', key: 1, field: 'note' })).toEqual({ value: null })
    expect(events).toHaveLength(1)
  })

  it('names a missing record, a field that is not encrypted and one that does not exist, never giving a value or auditing', async () => {
    events.length = 0
    expect(await runJob({ resource: 'targets', key: 99, field: 'password' })).toEqual({ error: 'No targets with key "99"' })
    expect(await runJob({ resource: 'targets', key: 1, field: 'host' })).toEqual({ error: '"targets.host" is not an encrypted field' })
    expect(await (await call('/api/functions/dispatch?key=1&field=secret')).json()).toEqual({ error: '"targets.secret" is not an encrypted field' })
    expect(await runJob({ resource: 'shares', key: 1, field: 'password' })).toEqual({ error: 'Unknown resource "shares"' })
    expect(events).toEqual([])
  })

  it('returns no value when its audit event is not accepted', async () => {
    const refusing = adminWith(key, { publish: () => Promise.reject(new Error('audit store down')) })
    const read = await outcome(() => refusing.decryptField({ job: 'read-target' })('targets', 1, 'password'))
    expect(read).toEqual({ error: 'audit store down' })
  })

  it('opens nothing under a key that did not seal it, and its error holds neither the value nor a key', async () => {
    events.length = 0
    const foreign = adminWith(otherKey, audit)
    const failure = await foreign.decryptField({ job: 'read-target' })('targets', 1, 'password').then(() => undefined, (error: Error) => error)
    expect(failure).toMatchObject({ name: 'UnreadableValue', kind: 'unknown-key' })
    for (const text of [failure!.message, failure!.stack ?? '']) {
      expect(text).not.toContain(canary)
      expect(text).not.toContain(key)
      expect(text).not.toContain(otherKey)
    }
    expect(events).toEqual([])
  })

  it('adds nothing to the HTTP API that decrypts, and the reveal answers as before', async () => {
    const probes = [
      ['/api/v1/targets/1:decryptField', 'POST'],
      ['/api/v1/targets/1:decrypt', 'POST'],
      ['/api/v1/targets/1?decryptField=password', 'GET'],
      ['/api/v1/targets/1?field=password', 'GET'],
      ['/api/v1/targets/1:reveal?decryptField=password', 'GET'],
    ] as const
    for (const [path, method] of probes) {
      const response = await call(path, { method, ...(method === 'POST' && { body: JSON.stringify({ field: 'password' }) }) })
      expect(await response.text()).not.toContain(canary)
    }
    events.length = 0
    const revealed = await call('/api/v1/targets/1:reveal', { method: 'POST', body: JSON.stringify({ field: 'password' }) })
    expect(await revealed.json()).toEqual({ field: 'password', value: canary })
    expect(lastEvent()).toEqual({ type: 'field.revealed', at: expect.any(String), actor: { id: 'u1', roles: ['admin'] }, tenant: 1, resource: 'targets', recordKey: '1', field: 'password', origin: { userAgent: 'probe/1' } })
  })
})
