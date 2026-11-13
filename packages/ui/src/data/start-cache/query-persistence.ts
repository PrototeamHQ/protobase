import { dehydrate, hydrate, type DehydratedState, type Query, type QueryClient } from '@tanstack/react-query'
import type { MetaData } from '../meta-data'
import { keys } from '../query-keys'
import { byteSize, softLimitBytes, withinLimit } from './size-limit'
import type { StartCache } from './start-cache'

/** How long after a change in the cache its queries are saved, so a burst of answers is written once. */
export const saveDelayMs = 1000

/** One cache owner's queries kept between starts. */
export type QueryPersistence = {
  /** Fills a new client with the queries last saved, every one marked stale so it is refetched as soon as it is used. */
  restore: (client: QueryClient) => void
  /** Saves the kept queries a moment after the cache changes, until the returned function stops it. */
  subscribe: (client: QueryClient) => () => void
}

const metaHash = JSON.stringify(keys.meta)

// A `/meta` frozen at another Protobase version (see `keepOnVersionChange`), and a cached answer whose refetch failed
// (see `keepCachedOnFailure`), are not saved: the answer saved before is kept.
const savable = (query: Query) =>
  query.state.status === 'success' && query.state.fetchFailureCount === 0 && !(query.queryHash === metaHash && (query.state.data as MetaData | undefined)?.versionChange)

/** When each saved query was last used, by query hash. */
export type Uses = Record<string, number>

/**
 * The queries to save, with when each was last used: the latest answer of every query the client holds, and the earlier
 * saved ones it no longer holds. A query whose last refetch failed keeps the answer saved before, so starting without a
 * network still shows what was last seen. Past `limit` bytes the least recently used are evicted (see `withinLimit`),
 * never `/meta` nor a query in `onScreen`, so the next start draws the page on screen whole: the total stays within
 * `limit` plus that page. A query never seen on screen counts as used when its answer came. `sizeOf` measures an answer.
 */
export const keptQueries = (
  client: QueryClient,
  saved: DehydratedState['queries'],
  used: Uses,
  sizeOf: (data: unknown) => number,
  onScreen: ReadonlySet<string>,
  limit = softLimitBytes,
): { queries: DehydratedState['queries']; used: Uses } => {
  const fresh = dehydrate(client, { shouldDehydrateQuery: savable }).queries
  const freshHashes = new Set(fresh.map((query) => query.queryHash))
  const all = [...fresh, ...saved.filter((query) => !freshHashes.has(query.queryHash))]
  const lastUsed = (query: (typeof all)[number]) => used[query.queryHash] ?? query.state.dataUpdatedAt
  const kept = withinLimit(all.map((query) => ({ hash: query.queryHash, bytes: query.queryHash.length + sizeOf(query.state.data), lastUsed: lastUsed(query), pinned: query.queryHash === metaHash || onScreen.has(query.queryHash) })), limit)
  const queries = all.filter((query) => kept.has(query.queryHash))
  return { queries, used: Object.fromEntries(queries.map((query) => [query.queryHash, lastUsed(query)])) }
}

/**
 * The start cache's queries of `owner`. A query is used when something on screen starts reading it, and while it is on
 * screen when the queries are saved.
 */
export const createQueryPersistence = ({ cache, owner }: { cache: StartCache; owner: string }): QueryPersistence => {
  const restored = cache.queries(owner)
  let used: Uses = { ...restored?.used }
  let saved = restored?.state.queries ?? []
  // Each answer is measured once: its size, by the answer itself, for as long as something holds that answer
  const sizes = new WeakMap<object, number>()
  const sizeOf = (data: unknown) => {
    if (typeof data !== 'object' || data === null) return byteSize(data)
    const known = sizes.get(data)
    if (known !== undefined) return known
    const size = byteSize(data)
    sizes.set(data, size)
    return size
  }
  return {
    restore: (client) => {
      if (!restored) return
      hydrate(client, restored.state)
      void client.invalidateQueries({ refetchType: 'none' })
    },
    subscribe: (client) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const save = () => {
        timer = undefined
        const now = Date.now()
        const onScreen = new Set(client.getQueryCache().findAll({ type: 'active' }).map((query) => query.queryHash))
        for (const hash of onScreen) used[hash] = now
        const next = keptQueries(client, saved, used, sizeOf, onScreen)
        saved = next.queries
        used = next.used
        void cache.saveQueries({ owner, used, state: { mutations: [], queries: saved } })
      }
      const unsubscribe = client.getQueryCache().subscribe((event) => {
        if (event.type === 'observerAdded') used[event.query.queryHash] = Date.now()
        else if (event.type !== 'added' && event.type !== 'removed' && event.type !== 'updated') return
        timer ??= setTimeout(save, saveDelayMs)
      })
      return () => {
        unsubscribe()
        clearTimeout(timer)
      }
    },
  }
}
