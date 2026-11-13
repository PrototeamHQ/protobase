import { dehydrate, hydrate, type DehydratedState, type Query, type QueryClient } from '@tanstack/react-query'
import type { MetaData } from '../meta-data'
import { keys } from '../query-keys'
import { seenOn, seenQueries, type SeenPage } from './seen-pages'
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

// A `/meta` frozen at another Protobase version (see `keepOnVersionChange`) is not saved: the one before it is kept.
const savable = (query: Query) => query.state.status === 'success' && !(query.queryHash === metaHash && (query.state.data as MetaData | undefined)?.versionChange)

/**
 * The queries to save: the latest answer of each query on screen now or on one of the last seen pages. A query whose
 * last refetch failed keeps the answer saved before, so starting without a network still shows what was last seen.
 */
export const keptQueries = (client: QueryClient, pages: readonly SeenPage[], saved: DehydratedState['queries']) => {
  const kept = new Set([...seenQueries(pages), ...client.getQueryCache().findAll({ type: 'active' }).map((query) => query.queryHash)])
  const fresh = dehydrate(client, { shouldDehydrateQuery: (query) => kept.has(query.queryHash) && savable(query) }).queries
  const freshHashes = new Set(fresh.map((query) => query.queryHash))
  const earlier = saved.filter((query) => kept.has(query.queryHash) && !freshHashes.has(query.queryHash))
  return [...fresh, ...earlier]
}

/**
 * The start cache's queries of `owner`. A query is noted on the page at `address()` when that page starts using it, the
 * current address as the router has already moved to it.
 */
export const createQueryPersistence = ({ cache, owner, address }: { cache: StartCache; owner: string; address: () => string }): QueryPersistence => {
  const restored = cache.queries(owner)
  let pages = restored?.pages ?? []
  let saved = restored?.state.queries ?? []
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
        saved = keptQueries(client, pages, saved)
        void cache.saveQueries({ owner, pages, state: { mutations: [], queries: saved } })
      }
      const unsubscribe = client.getQueryCache().subscribe((event) => {
        if (event.type === 'observerAdded') pages = seenOn(pages, address(), event.query.queryHash)
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
