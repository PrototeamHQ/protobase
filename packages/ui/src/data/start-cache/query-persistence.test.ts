import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MetaData } from '../meta-data'
import { keys } from '../query-keys'
import { createQueryPersistence, saveDelayMs } from './query-persistence'
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

let address = '/today'

beforeEach(() => {
  vi.useFakeTimers()
  address = '/today'
})
afterEach(() => vi.useRealTimers())

describe('the queries kept between starts', () => {
  it('fills a new client with the saved answers, every one stale so it is fetched again when used', () => {
    const earlier = newClient()
    earlier.setQueryData(['list', 'tasks'], { rows: [1, 2] })
    const stored: CachedQueries = { owner: 'user:u1', pages: [], state: { mutations: [], queries: earlier.getQueryCache().getAll().map((query) => ({ queryKey: query.queryKey, queryHash: query.queryHash, state: query.state, dehydratedAt: 0 })) } }
    const client = newClient()
    createQueryPersistence({ cache: fakeCache(stored).cache, owner: 'user:u1', address: () => address }).restore(client)
    expect(client.getQueryData(['list', 'tasks'])).toEqual({ rows: [1, 2] })
    expect(client.getQueryCache().find({ queryKey: ['list', 'tasks'] })?.isStale()).toBe(true)
  })

  it('restores nothing into another owner’s client', () => {
    const stored: CachedQueries = { owner: 'user:u1', pages: [], state: { mutations: [], queries: [] } }
    const client = newClient()
    const restore = vi.spyOn(client, 'invalidateQueries')
    createQueryPersistence({ cache: fakeCache(stored).cache, owner: 'user:u2', address: () => address }).restore(client)
    expect(restore).not.toHaveBeenCalled()
  })

  it('saves what the pages showed a moment after it came, with the page each query drew', async () => {
    const { cache, saves } = fakeCache()
    const client = newClient()
    const stop = createQueryPersistence({ cache, owner: 'user:u1', address: () => address }).subscribe(client)
    observe(client, ['list', 'tasks'], async () => ({ rows: [1] }))
    await vi.advanceTimersByTimeAsync(saveDelayMs)
    expect(saves.at(-1)?.pages).toEqual([{ address: '/today', queries: ['["list","tasks"]'] }])
    expect(hashes(saves.at(-1))).toEqual(['["list","tasks"]'])
    stop()
  })

  it('drops the queries of pages beyond the last five, once nothing shows them', async () => {
    const { cache, saves } = fakeCache()
    const client = newClient()
    const stop = createQueryPersistence({ cache, owner: 'user:u1', address: () => address }).subscribe(client)
    for (const page of ['a', 'b', 'c', 'd', 'e', 'f']) {
      address = `/${page}`
      const shown = observe(client, ['list', page], async () => ({ page }))
      await vi.advanceTimersByTimeAsync(saveDelayMs)
      shown.stop()
    }
    await vi.advanceTimersByTimeAsync(saveDelayMs)
    expect(saves.at(-1)?.pages.map((page) => page.address)).toEqual(['/f', '/e', '/d', '/c', '/b'])
    expect(hashes(saves.at(-1))).not.toContain('["list","a"]')
    expect(hashes(saves.at(-1))).toHaveLength(5)
    stop()
  })

  it('keeps the earlier answer of a query whose refetch failed', async () => {
    const { cache, saves } = fakeCache()
    const client = newClient()
    const stop = createQueryPersistence({ cache, owner: 'user:u1', address: () => address }).subscribe(client)
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
    const stop = createQueryPersistence({ cache, owner: 'user:u1', address: () => address }).subscribe(client)
    const meta = { versionChange: { to: '2.0.0' } } as Partial<MetaData>
    observe(client, keys.meta, async () => meta)
    await vi.advanceTimersByTimeAsync(saveDelayMs)
    expect(hashes(saves.at(-1))).toEqual([])
    stop()
  })

  it('saves nothing once stopped, as when the owner signs out', async () => {
    const { cache, saves } = fakeCache()
    const client = newClient()
    const stop = createQueryPersistence({ cache, owner: 'user:u1', address: () => address }).subscribe(client)
    observe(client, ['list', 'tasks'], async () => ({ rows: [1] }))
    stop()
    await vi.advanceTimersByTimeAsync(saveDelayMs * 2)
    expect(saves).toEqual([])
  })
})
