import { describe, expect, it, vi } from 'vitest'
import { f, resource } from '@protobase/schema'
import type { Caller } from '../api-keys/resolve-caller'
import type { NoticeFeed } from '../live/notice-feed'
import type { Notice } from '../live/notices-sql'
import { buildRegistry } from '../registry'
import type { CheckGroup, ResourceView } from './change-checker'
import { changeHub } from './change-hub'
import type { ChangePayload } from './change-payload'
import { parseBindings } from './postgres-changes'

const { entries } = buildRegistry([resource('todos').table('todos').fields({ id: f.integer(), user_id: f.text() }).primaryKey((r) => r.id).live()])
const todos = entries[0]!

const alice: Caller = { role: 'authenticated', claims: { sub: 'alice' } }
const bob: Caller = { role: 'authenticated', claims: { sub: 'bob' } }

const notice = (id: string, key: string, operation: Notice['operation']): Notice => ({ id, resource: 'todos', key, operation, tenant: null, at: '2026-08-01T00:00:00.000Z' })

const fakeFeed = () => {
  let listener: ((notices: Notice[]) => void) | undefined
  const stop = vi.fn(() => (listener = undefined))
  const feed: NoticeFeed = { subscribe: async (listen) => ((listener = listen), { cursor: '0', stop }), replay: async () => [] }
  return { feed, stop, push: (notices: Notice[]) => listener?.(notices) }
}

// Rows each user sees under RLS: their own, by key; every delete, by key; filters met when the row is the user's.
const rows: Record<string, { user_id: string }> = { '1': { user_id: 'alice' }, '2': { user_id: 'bob' } }
const fakeCheck = vi.fn(async (groups: readonly CheckGroup[]) =>
  groups.map((group) =>
    group.resources.map((check): ResourceView => {
      const sub = group.caller.role === 'authenticated' ? group.caller.claims.sub : undefined
      const seen = (key: string) => ({ record: { id: Number(key), ...rows[key] }, oldRecord: { id: Number(key) }, matches: check.filters.map(() => rows[key]?.user_id === sub) })
      return {
        columns: [{ name: 'id', type: 'int4' }],
        rows: new Map(check.keys.filter((key) => rows[key]?.user_id === sub).map((key) => [key, seen(key)])),
        deleted: new Map(check.deleted.map((key) => [key, { record: {}, oldRecord: { id: Number(key) }, matches: check.filters.map(() => false) }])),
        failed: new Set<number>(),
      }
    }),
  ),
)

const sink = (caller: Caller, requested: unknown[], ids: { next: number }) => {
  const parsed = parseBindings(requested, entries, () => ++ids.next)
  if (typeof parsed === 'string') throw new Error(parsed)
  const sent: ChangePayload[] = []
  const failures: string[] = []
  return { sink: { caller: () => caller, bindings: parsed.bindings, send: (payload: ChangePayload) => sent.push(payload), fail: (message: string) => failures.push(message) }, sent, failures }
}

describe('changeHub', () => {
  it('sends each channel the changes its caller may see and its bindings ask for, checking callers alike as one', async () => {
    const { feed, push, stop } = fakeFeed()
    const hub = changeHub({ feed, check: fakeCheck, entry: (name) => (name === 'todos' ? todos : undefined), report: (error) => { throw error } })
    const ids = { next: 0 }
    const tab1 = sink(alice, [{ event: '*', schema: 'public', table: 'todos' }], ids)
    const tab2 = sink(alice, [{ event: 'INSERT', schema: 'public', table: 'todos' }, { event: 'DELETE', schema: 'public', table: 'todos', filter: 'user_id=eq.alice' }], ids)
    const other = sink(bob, [{ event: 'INSERT', schema: 'public', table: 'todos' }], ids)
    const removes = [hub.add(tab1.sink), hub.add(tab2.sink), hub.add(other.sink)]
    push([notice('1', '1', 'create'), notice('2', '2', 'create'), notice('3', '1', 'update'), notice('4', '3', 'delete'), notice('5', '9', 'create')])
    await vi.waitFor(() => expect(other.sent).toHaveLength(1))
    expect(fakeCheck).toHaveBeenCalledTimes(1)
    expect(fakeCheck.mock.calls[0]![0].map((group) => group.caller)).toEqual([alice, bob])
    expect(fakeCheck.mock.calls[0]![0][0]!.resources[0]).toMatchObject({ keys: ['1', '2', '9'], deleted: ['3'], filters: [[{ column: 'user_id' }]] })
    expect(tab1.sent.map((payload) => [payload.ids, payload.data.type, payload.data.record ?? payload.data.old_record])).toEqual([
      [[1], 'INSERT', { id: 1, user_id: 'alice' }],
      [[1], 'UPDATE', { id: 1, user_id: 'alice' }],
      [[1], 'DELETE', { id: 3 }],
    ])
    // The DELETE binding's filter is not met by a key alone.
    expect(tab2.sent.map((payload) => [payload.ids, payload.data.type])).toEqual([[[2], 'INSERT']])
    expect(other.sent.map((payload) => [payload.ids, payload.data])).toEqual([
      [[4], { schema: 'public', table: 'todos', commit_timestamp: '2026-08-01T00:00:00.000Z', type: 'INSERT', columns: [{ name: 'id', type: 'int4' }], record: { id: 2, user_id: 'bob' }, errors: null }],
    ])
    for (const remove of removes) remove()
    await vi.waitFor(() => expect(stop).toHaveBeenCalledTimes(1))
  })

  it('ends only the channels of a filter Postgres refused, delivers the others, and checks it no more', async () => {
    const { feed, push } = fakeFeed()
    // Every row is seen and filter 0 matches; the filter `user_id=eq.bad` fails.
    const check = vi.fn(async (groups: readonly CheckGroup[]) =>
      groups.map((group) =>
        group.resources.map((resource): ResourceView => ({
          columns: [{ name: 'id', type: 'int4' }],
          rows: new Map(resource.keys.map((key) => [key, { record: { id: Number(key) }, oldRecord: { id: Number(key) }, matches: resource.filters.map((conditions) => conditions[0]!.value === 'alice') }])),
          deleted: new Map(),
          failed: new Set(resource.filters.flatMap((conditions, index) => (conditions[0]!.value === 'bad' ? [index] : []))),
        })),
      ),
    )
    const hub = changeHub({ feed, check, entry: () => todos, report: (error) => { throw error } })
    const ids = { next: 0 }
    const bad = sink(bob, [{ event: '*', schema: 'public', table: 'todos', filter: 'user_id=eq.bad' }], ids)
    const good = sink(bob, [{ event: '*', schema: 'public', table: 'todos', filter: 'user_id=eq.alice' }], ids)
    const all = sink(bob, [{ event: '*', schema: 'public', table: 'todos' }], ids)
    for (const { sink: added } of [bad, good, all]) hub.add(added)
    push([notice('1', '1', 'create')])
    await vi.waitFor(() => expect(bad.failures).toEqual(['Unable to listen to changes with the filter "user_id=eq.bad": the database refused it']))
    expect(bad.sent).toEqual([])
    expect(good.sent).toHaveLength(1)
    expect(all.sent).toHaveLength(1)
    expect(good.failures).toEqual([])
    push([notice('2', '2', 'create')])
    await vi.waitFor(() => expect(all.sent).toHaveLength(2))
    expect(check.mock.calls[1]![0][0]!.resources[0]!.filters).toEqual([[expect.objectContaining({ value: 'alice' })]])
    expect(bad.failures).toHaveLength(1)
  })
})
