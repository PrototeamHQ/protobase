import { randomBytes } from 'node:crypto'
import { Kysely, PostgresDialect, sql } from 'kysely'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { f, resource } from '@protobase/schema'
import { changesMigration, createAdmin, createEncryptionTools, jobsSchemaMigration, startJobs } from '@protobase/server'
import { connectServer, databaseUrl, serverReachable } from '../../scripts/test-db/templates'

// Workers poll on real timers, which a busy machine stretches.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const reachable = await serverReachable()
const name = `encryption_${randomBytes(4).toString('hex')}`
const key = Buffer.from(Array.from({ length: 32 }, (_, i) => i)).toString('base64')
const noteCanary = 'NOTE-CANARY-0001'
const tokenCanary = 'TOKEN-CANARY-0002'

const ddl = `
create table notes (id integer generated always as identity primary key, title text not null, note text, device_token text);
create table drafts (id integer generated always as identity primary key, note text);
create table parents (id text primary key);
create table children (id text primary key references parents (id) on update cascade, secret text);`

// The same table before and after its note and token are encrypted; drafts has a plain note of its own.
const notesWith = (encrypt: boolean) => {
  const text = () => (encrypt ? f.text().optional().encrypted() : f.text().optional())
  return resource('notes').table('notes').fields({ id: f.integer().readOnly(), title: f.text(), note: text(), token: text().column('device_token') }).primaryKey((r) => r.id).history()
}
const drafts = resource('drafts').table('drafts').fields({ id: f.integer().readOnly(), note: f.text().optional() }).primaryKey((r) => r.id).history()
const children = resource('children').table('children').fields({ id: f.text(), secret: f.text().optional().encrypted() }).primaryKey((r) => r.id)

afterAll(async () => {
  if (!reachable) return
  const server = connectServer()
  await server.unsafe(`drop database if exists "${name}" with (force)`)
  await server.end()
})

describe.skipIf(!reachable)('encrypting a column that history and the outbox captured', () => {
  let pool: pg.Pool
  let db: Kysely<any>
  const authenticate = () => ({ user: { id: 'u1', roles: ['admin'] } })
  const call = (admin: ReturnType<typeof createAdmin>, path: string, method: string, body?: unknown) =>
    admin.request(`/api/v1${path}`, { method, headers: { 'content-type': 'application/json', 'if-match': '*' }, ...(body !== undefined && { body: JSON.stringify(body) }) })
  const count = async (query: ReturnType<typeof sql<{ count: string }>>) => Number((await query.execute(db)).rows[0]!.count)
  const holding = (table: 'history' | 'outbox', text: string) => count(sql`select count(*)::text as count from ${sql.table(`changes.${table}`)} where ${sql.raw(table === 'history' ? `concat(before::text, after::text)` : `concat(old::text, new::text)`)} like ${`%${text}%`}`)

  beforeAll(async () => {
    const server = connectServer()
    await server.unsafe(`create database "${name}"`)
    await server.end()
    pool = new pg.Pool({ connectionString: databaseUrl(name), max: 3 })
    db = new Kysely<any>({ dialect: new PostgresDialect({ pool }) })
    await pool.query((await jobsSchemaMigration(db))!)
    await pool.query(ddl)
    await pool.query((await changesMigration(db, [notesWith(false).toModel(), drafts.toModel()]))!)
  })
  afterAll(async () => { await db?.destroy() })

  it('removes the old plaintext from history and the outbox, captures nothing of its own, and leaves capture on', async () => {
    // Before: a plain note reaches history through the worker; a token written while it is stopped stays in the outbox.
    const plain = createAdmin({ resources: [notesWith(false), drafts], db, authenticate, history: { days: 30 } })
    const errors: unknown[] = []
    const runtime = await startJobs({ db, jobs: plain.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => errors.push(error) })
    expect((await call(plain, '/notes', 'POST', { title: 'a', note: noteCanary })).status).toBe(201)
    expect((await call(plain, '/drafts', 'POST', { note: noteCanary })).status).toBe(201)
    await vi.waitFor(async () => expect(await count(sql`select count(*)::text as count from changes.history`)).toBe(2), { timeout: 15_000, interval: 50 })
    await runtime.stop()
    expect(errors).toEqual([])
    expect((await call(plain, '/notes/1', 'PATCH', { token: tokenCanary })).status).toBe(200)
    expect(await holding('history', noteCanary)).toBe(2)
    expect(await holding('outbox', tokenCanary)).toBe(1)

    // The fields become encrypted: the trigger change first, as `protobase migration` writes it, then apply.
    await pool.query((await changesMigration(db, [notesWith(true).toModel(), drafts.toModel()]))!)
    const tools = createEncryptionTools({ resources: [notesWith(true), drafts, children], db, env: { PROTOBASE_ENCRYPTION_KEY: key } })!
    const before = await tools.status()
    expect(before.fields.map(({ field, plaintext, history, outbox }) => ({ field, plaintext, history, outbox }))).toEqual([
      // The token's update kept the note in its outbox row, and the note's create an empty token in history
      { field: 'note', plaintext: 1, history: 1, outbox: 1 },
      { field: 'token', plaintext: 1, history: 1, outbox: 1 },
      { field: 'secret', plaintext: 0, history: 0, outbox: 0 },
    ])
    expect(before.cascading).toEqual([{ resource: 'children', constraint: 'children_id_fkey' }])

    const rows = async () => [await count(sql`select count(*)::text as count from changes.history`), await count(sql`select count(*)::text as count from changes.outbox`)]
    const kept = await rows()
    const applied = await tools.apply()
    expect(applied.fields.map(({ field, encrypted, historyScrubbed, outboxScrubbed }) => ({ field, encrypted, historyScrubbed, outboxScrubbed }))).toEqual([
      { field: 'note', encrypted: 1, historyScrubbed: 1, outboxScrubbed: 1 },
      { field: 'token', encrypted: 1, historyScrubbed: 1, outboxScrubbed: 1 },
      { field: 'secret', encrypted: 0, historyScrubbed: 0, outboxScrubbed: 0 },
    ])
    expect(await rows()).toEqual(kept)
    expect(await count(sql`select count(*)::text as count from changes.history where resource = 'notes' and (before ? 'note' or after ? 'note')`)).toBe(0)
    expect(await holding('outbox', tokenCanary)).toBe(0)
    // Drafts' own note, over another table, is no part of it
    expect(await holding('history', noteCanary)).toBe(1)
    expect(await count(sql`select count(*)::text as count from changes.history where resource = 'drafts' and after ? 'note'`)).toBe(1)
    expect(await count(sql`select count(*)::text as count from pg_cursors`)).toBe(0)

    const after = await tools.status()
    expect(after.fields.every((field) => field.plaintext === 0 && field.history === 0 && field.outbox === 0 && field.unreadable.length === 0)).toBe(true)

    vi.stubEnv('PROTOBASE_ENCRYPTION_KEY', key)
    const encrypted = createAdmin({ resources: [notesWith(true), drafts, children], db, authenticate, history: { days: 30 } })
    vi.unstubAllEnvs()
    expect(await (await call(encrypted, '/notes/1:reveal', 'POST', { field: 'note' })).json()).toEqual({ field: 'note', value: noteCanary })
    expect(await (await call(encrypted, '/notes/1:reveal', 'POST', { field: 'token' })).json()).toEqual({ field: 'token', value: tokenCanary })

    // Capture stayed on for everyone else: the next change of a plain field is captured as usual.
    expect((await call(encrypted, '/notes/1', 'PATCH', { title: 'b' })).status).toBe(200)
    expect(await count(sql`select count(*)::text as count from changes.outbox where new->>'title' = 'b'`)).toBe(1)
  })
})
