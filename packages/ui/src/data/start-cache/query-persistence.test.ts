import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MetaData } from '../meta-data'
import { keys } from '../query-keys'
import { createQueryPersistence, keptQueries, saveDelayMs } from './query-persistence'
import { byteSize } from './size-limit'
import type { CachedQueries, StartCache } from './start-cache'

const fakeCache = (stored?: CachedQueries) => {
  const saves: CachedQueries[] = []
  const cache: StartCache = {
    session: () => undefined,
    queries: (owner) => (stored?.owner === owner ? stored : undefined),
    saveSession: async () => {},
    saveQueries: async (queries) => void saves.push(queries),
    clear: async () => {},
  }
  return { cache, saves }
}

const newClient = () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } })

// A query as a page uses it: observed, so it is on screen and counted as active.
const observe = (client: QueryClient, queryKey: readonly unknown[], queryFn: () => Promise<unknown>) => {
  const observer = new QueryObserver(client, { queryKey, queryFn })
  const stop = observer.subscribe(() => {})
  return { observer, stop }
}

const hashes = (saved: CachedQueries | undefined) => saved?.state.queries.map((query) => query.queryHash)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000_000)
})
afterEach(() => vi.useRealTimers())

describe('the queries kept between starts', () => {
  it('fills a new client with the saved answers, every one stale so it is fetched again when used', () => {
    const earlier = newClient()
    earlier.setQueryData(['list', 'tasks'], { rows: [1, 2] })
    const stored: CachedQueries = { owner: 'user:u1', used: {}, state: { mutations: [], queries: earlier.getQueryCache().getAll().map((query) => ({ queryKey: query.queryKey, queryHash: query.queryHash, state: query.state, dehydratedAt: 0 })) } }
    const client = newClient()
    createQueryPersistence({ cache: fakeCache(stored).cache, owner: 'user:u1' }).restore(client)
    expect(client.getQueryData(['list', 'tasks'])).toEqual({ rows: [1, 2] })
    expect(client.getQueryCache().find({ queryKey: ['list', 'tasks'] })?.isStale()).toBe(true)
  })

  it('restores nothing into another owner’s client', () => {
    const stored: CachedQueries = { owner: 'user:u1', used: {}, state: { mutations: [], queries: [] } }
    const client = newClient()
    const restore = vi.spyOn(client, 'invalidateQueries')
    createQueryPersistence({ cache: fakeCache(stored).cache, owner: 'user:u2' }).restore(client)
    expect(restore).not.toHaveBeenCalled()
  })

  it('saves what the pages showed a moment after it came, with when each was last used', async () => {
    const { cache, saves } = fakeCache()
    const client = newClient()
    const stop = createQueryPersistence({ cache, owner: 'user:u1' }).subscribe(client)
    observe(client, ['list', 'tasks'], async () => ({ rows: [1] }))
    await vi.advanceTimersByTimeAsync(saveDelayMs)
    expect(hashes(saves.at(-1))).toEqual(['["list","tasks"]'])
    expect(saves.at(-1)?.used).toEqual({ '["list","tasks"]': Date.now() })
    stop()
  })

  it('keeps answers no longer on screen while the cache stays within its soft limit', async () => {
    const { cache, saves } = fakeCache()
    const client = newClient()
    const stop = createQueryPersistence({ cache, owner: 'user:u1' }).subscribe(client)
    for (const page of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
      const shown = observe(client, ['list', page], async () => ({ page }))
      await vi.advanceTimersByTimeAsync(saveDelayMs)
      shown.stop()
    }
    await vi.advanceTimersByTimeAsync(saveDelayMs)
    expect(hashes(saves.at(-1))).toHaveLength(7)
    stop()
  })

  it('evicts the least recently used answers once the cache passes its soft limit, never /meta', async () => {
    const client = newClient()
    const rows = (count: number) => ({ rows: Array.from({ length: count }, (_, index) => index) })
    client.setQueryData(keys.meta, { appName: 'Old' }, { updatedAt: 1 })
    client.setQueryData(['list', 'oldest'], rows(100), { updatedAt: 10 })
    client.setQueryData(['list', 'older'], rows(100), { updatedAt: 20 })
    client.setQueryData(['list', 'newest'], rows(100), { updatedAt: 30 })
    const one = byteSize(rows(100)) + '["list","oldest"]'.length
    const used = { '["list","older"]': 40 }
    const kept = keptQueries(client, [], used, byteSize, 2 * one + 30)
    expect(kept.queries.map((query) => query.queryHash).sort()).toEqual(['["list","newest"]', '["list","older"]', '["meta"]'])
    expect(kept.used).toEqual({ '["meta"]': 1, '["list","older"]': 40, '["list","newest"]': 30 })
  })

  it('weighs and evicts earlier saved answers the client no longer holds with the rest', () => {
    const earlier = newClient()
    earlier.setQueryData(['list', 'gone'], { rows: [1, 2, 3] }, { updatedAt: 5 })
    const saved = earlier.getQueryCache().getAll().map((query) => ({ queryKey: query.queryKey, queryHash: query.queryHash, state: query.state, dehydratedAt: 0 }))
    const client = newClient()
    client.setQueryData(['list', 'now'], { rows: [1, 2, 3] }, { updatedAt: 50 })
    expect(keptQueries(client, saved, {}, byteSize, 1_000_000).queries.map((query) => query.queryHash)).toEqual(['["list","now"]', '["list","gone"]'])
    expect(keptQueries(client, saved, {}, byteSize, 40).queries.map((query) => query.queryHash)).toEqual(['["list","now"]'])
  })

  it('keeps the earlier answer of a query whose refetch failed', async () => {
    const { cache, saves } = fakeCache()
    const client = newClient()
    const stop = createQueryPersistence({ cache, owner: 'user:u1' }).subscribe(client)
    let answer: () => Promise<unknown> = async () => ({ rows: [1] })
    const shown = observe(client, ['list', 'tasks'], () => answer())
    await vi.advanceTimersByTimeAsync(saveDelayMs)
    answer = async () => Promise.reject(new Error('offline'))
    await shown.observer.refetch()
    await vi.advanceTimersByTimeAsync(saveDelayMs)
    expect(saves.at(-1)?.state.queries[0]?.state.data).toEqual({ rows: [1] })
    stop()
  })

  it('does not save a /meta frozen at another Protobase version', async () => {
    const { cache, saves } = fakeCache()
    const client = newClient()
    const stop = createQueryPersistence({ cache, owner: 'user:u1' }).subscribe(client)
    const meta = { versionChange: { to: '2.0.0' } } as Partial<MetaData>
    observe(client, keys.meta, async () => meta)
    await vi.advanceTimersByTimeAsync(saveDelayMs)
    expect(hashes(saves.at(-1))).toEqual([])
    stop()
  })

  it('saves nothing once stopped, as when the owner signs out', async () => {
    const { cache, saves } = fakeCache()
    const client = newClient()
    const stop = createQueryPersistence({ cache, owner: 'user:u1' }).subscribe(client)
    observe(client, ['list', 'tasks'], async () => ({ rows: [1] }))
    stop()
    await vi.advanceTimersByTimeAsync(saveDelayMs * 2)
    expect(saves).toEqual([])
  })
})
