import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { f, resource } from '@protobase/schema'
import { encodeKey } from '@protobase/schema/internal'
import type { Caller } from '../src/api-keys/resolve-caller'
import type { NoticeFeed } from '../src/live/notice-feed'
import type { Notice } from '../src/live/notices-sql'
import { buildRegistry, type Entry } from '../src/registry'
import { changeChecker } from '../src/realtime/change-checker'
import { changeHub } from '../src/realtime/change-hub'
import type { ChangePayload } from '../src/realtime/change-payload'
import { parseBindings } from '../src/realtime/postgres-changes'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../../test-support/postgres-database'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 30_000 })

const { entries } = buildRegistry([
  resource('rooms').table('rooms').fields({ id: f.integer(), room: f.integer(), public: f.boolean() }).primaryKey((r) => r.id).live(),
  resource('triples').table('triples').fields({ a: f.integer(), b: f.integer(), c: f.integer(), room: f.integer() }).primaryKey((r) => [r.a, r.b, r.c]).live(),
])
const [rooms, triples] = entries as [Entry, Entry]

// Anon sees only public rooms; the secret key's caller, the tables' owner, sees every one.
const schema = `
do $$ begin create role anon nologin; exception when duplicate_object or unique_violation then null; end $$;
create table rooms (id integer primary key, room integer not null, public boolean not null);
alter table rooms enable row level security;
create policy "public rooms" on rooms for select to anon using (public);
grant select on rooms to anon;
create table triples (a integer, b integer, c integer, room integer not null, primary key (a, b, c));
grant select on triples to anon;
`

const anon: Caller = { role: 'anon', claims: { role: 'anon' } }
const app: Caller = { role: 'app', claims: { role: 'service_role' } }

describe.skipIf(!(await postgresTemplateReady('jobs')))('changeChecker on Postgres, with more filters than one query holds', () => {
  let pg: PostgresDatabase
  const errors: unknown[] = []

  beforeAll(async () => {
    pg = await openPostgresDatabase('jobs')
    await pg.exec(schema)
  })

  afterAll(async () => {
    await pg?.close()
    expect(errors).toEqual([])
  })

  // A hub over the real checker, fed notices by hand, with one sink per binding asked for.
  const hubWith = (sinks: { caller: Caller; entry: Entry; filter?: string; event?: string }[]) => {
    let listener: ((notices: Notice[]) => void) | undefined
    const feed: NoticeFeed = { subscribe: async (listen) => ((listener = listen), { cursor: '0', stop: () => {} }), replay: async () => [] }
    const check = changeChecker({ db: pg.db, statementTimeoutMs: 30_000, report: (error) => errors.push(error) })
    const hub = changeHub({ feed, check, entry: (name) => entries.find((entry) => entry.name === name), report: (error) => errors.push(error) })
    let id = 0
    const heard = sinks.map(({ caller, entry, filter, event = '*' }) => {
      const parsed = parseBindings([{ event, schema: 'public', table: entry.model.table.name, ...(filter !== undefined && { filter }) }], entries, () => ++id)
      if (typeof parsed === 'string') throw new Error(parsed)
      const sent: ChangePayload[] = []
      const failures: string[] = []
      hub.add({ caller: () => caller, bindings: parsed.bindings, send: (payload) => sent.push(payload), fail: (message) => failures.push(message) })
      return { sent, failures }
    })
    let next = 0
    const push = async (entry: Entry, keys: (number | number[])[], operation: Notice['operation'] = 'create') => {
      await vi.waitFor(() => expect(listener).toBeDefined())
      listener!(keys.map((key) => ({ id: String(++next), resource: entry.name, key: encodeKey((Array.isArray(key) ? key : [key]).map(String)), operation, tenant: null, at: '2026-10-28T00:00:00.000Z' })))
    }
    return { heard, push }
  }

  const rowsOf = (sent: readonly ChangePayload[]) => sent.map((payload): [string, Record<string, unknown>] => [payload.data.type, (payload.data.record ?? payload.data.old_record) as Record<string, unknown>])

  it('sends each change to exactly the binding whose filter it meets, in every chunk, and RLS still decides', async () => {
    await sql`insert into rooms (id, room, public) values (1, 0, true), (2, 999, true), (3, 1000, true), (4, 1999, true), (5, 0, false), (6, 1999, false)`.execute(pg.db)
    const filters = Array.from({ length: 2000 }, (_, room) => ({ caller: anon, entry: rooms, filter: `room=eq.${room}` }))
    const { heard, push } = hubWith([{ caller: app, entry: rooms }, ...filters])
    const [secretKey, ...bindings] = heard as [(typeof heard)[0], ...typeof heard]
    await push(rooms, [1, 2, 3, 4, 5, 6])
    await vi.waitFor(() => expect(secretKey.sent).toHaveLength(6))
    const expected = new Map([[0, [1]], [999, [2]], [1000, [3]], [1999, [4]]])
    bindings.forEach((binding, room) => expect(rowsOf(binding.sent).map(([, row]) => row.id), `room ${room}`).toEqual(expected.get(room) ?? []))
    for (const binding of bindings) expect(binding.failures).toEqual([])

    await sql`update rooms set public = not public where id in (4, 6)`.execute(pg.db)
    await push(rooms, [4, 6], 'update')
    await vi.waitFor(() => expect(secretKey.sent).toHaveLength(8))
    expect(rowsOf(bindings[1999]!.sent)).toEqual([['INSERT', expect.objectContaining({ id: 4 })], ['UPDATE', expect.objectContaining({ id: 6 })]])
    expect(bindings.reduce((sum, binding) => sum + binding.sent.length, 0)).toBe(5)
  })

  it('matches the first and last filter of each chunk on a three-column key, and none of their neighbours', async () => {
    await sql`insert into triples (a, b, c, room) values (1, 1, 1, 0), (1, 1, 2, 999), (1, 2, 1, 1000), (2, 1, 1, 1999)`.execute(pg.db)
    const bindings = Array.from({ length: 2000 }, (_, room) => ({ caller: anon, entry: triples, filter: `room=eq.${room}` }))
    const { heard, push } = hubWith(bindings)
    await push(triples, [[1, 1, 1], [1, 1, 2], [1, 2, 1], [2, 1, 1]])
    await vi.waitFor(() => expect(heard[1999]!.sent).toHaveLength(1))
    const hearing = heard.flatMap((binding, room) => binding.sent.map((payload) => [room, (payload.data.record as Record<string, unknown>).room]))
    expect(hearing).toEqual([[0, 0], [999, 999], [1000, 1000], [1999, 1999]])
  })

  it('sends a row to every in-list binding that names its room, whatever the bindings\' lists hold in total', async () => {
    await sql`insert into rooms (id, room, public) select 10000 + n, n, true from generate_series(0, 99) n`.execute(pg.db)
    // Binding i lists the rooms i .. i + 99: 700 lists of 100 values each.
    const lists = Array.from({ length: 700 }, (_, i) => Array.from({ length: 100 }, (_, n) => i + n))
    const { heard, push } = hubWith([{ caller: anon, entry: rooms }, ...lists.map((list) => ({ caller: anon, entry: rooms, filter: `room=in.(${list.join(',')})` }))])
    await push(rooms, Array.from({ length: 100 }, (_, n) => 10000 + n))
    await vi.waitFor(() => expect(heard[0]!.sent).toHaveLength(100))
    lists.forEach((list, i) => {
      const expected = list.filter((room) => room < 100).map((room) => 10000 + room)
      expect(rowsOf(heard[i + 1]!.sent).map(([, row]) => row.id), `binding ${i}`).toEqual(expected)
    })
  })

  it('fails only the binding of a filter Postgres refuses inside a chunk, and the rest of its chunk still matches', async () => {
    await sql`insert into rooms (id, room, public) values (20000, 1500, true), (20001, 1501, true)`.execute(pg.db)
    const bindings = Array.from({ length: 2000 }, (_, room) => ({ caller: anon, entry: rooms, filter: room === 1600 ? 'room=eq.abc' : `room=eq.${room}` }))
    const { heard, push } = hubWith(bindings)
    await push(rooms, [20000, 20001])
    await vi.waitFor(() => expect(heard[1600]!.failures).toEqual(['Unable to listen to changes with the filter "room=eq.abc": the database refused it']))
    expect(rowsOf(heard[1500]!.sent).map(([, row]) => row.id)).toEqual([20000])
    expect(rowsOf(heard[1501]!.sent).map(([, row]) => row.id)).toEqual([20001])
    expect(heard.filter((binding) => binding.failures.length > 0)).toHaveLength(1)
  })
})
