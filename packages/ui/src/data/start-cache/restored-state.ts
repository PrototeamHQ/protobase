import { useQueryClient, type Query, type QueryClient, type QueryState } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useSyncExternalStore } from 'react'

/** When the query client started: an answer older than this came from the start cache. */
export const ClientStartContext = createContext(0)

/** The answer a query holds came from the start cache and has not been fetched again since the client started. */
export const isRestored = (state: Pick<QueryState, 'data' | 'dataUpdatedAt'>, startedAt: number) => state.data !== undefined && state.dataUpdatedAt < startedAt

/**
 * What the page shows of the start cache: `stale` while a query on screen still holds a cached answer, `refreshing`
 * while one of those is being fetched again, `failed` once one could not be, as its fetch failed (see
 * `keepCachedOnFailure`) or waits for a network.
 */
export type RestoredState = 'fresh' | 'refreshing' | 'stale' | 'failed'

export const restoredState = (queries: readonly Pick<Query, 'state'>[], startedAt: number): RestoredState => {
  const restored = queries.filter((query) => isRestored(query.state, startedAt))
  if (restored.length === 0) return 'fresh'
  if (restored.some((query) => query.state.status === 'error' || query.state.fetchFailureCount > 0 || query.state.fetchStatus === 'paused')) return 'failed'
  if (restored.some((query) => query.state.fetchStatus === 'fetching')) return 'refreshing'
  return 'stale'
}

/**
 * Keeps a cached answer on screen when fetching it again fails, as a query keeps its data but turns to `error`, which
 * parts draw in place of the data: it stays a success, still stale, and the failure stays in its `fetchFailureCount`,
 * which `restoredState` shows beside the page's title instead.
 */
export const keepCachedOnFailure = (client: QueryClient, startedAt: number) =>
  client.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'error' || !isRestored(event.query.state, startedAt)) return
    event.query.setState({ status: 'success', error: null })
  })

/** `restoredState` of the queries on screen, kept up to date as they refresh. */
export const useRestoredState = () => {
  const cache = useQueryClient().getQueryCache()
  const startedAt = useContext(ClientStartContext)
  const subscribe = useCallback((changed: () => void) => cache.subscribe(changed), [cache])
  const read = useCallback(() => restoredState(cache.findAll({ type: 'active' }), startedAt), [cache, startedAt])
  return useSyncExternalStore(subscribe, read, read)
}
