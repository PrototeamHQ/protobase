import { useQueryClient, type Query, type QueryState } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useSyncExternalStore } from 'react'

/** When the query client started: an answer older than this came from the start cache. */
export const ClientStartContext = createContext(0)

/** The answer a query holds came from the start cache and has not been fetched again since the client started. */
export const isRestored = (state: Pick<QueryState, 'data' | 'dataUpdatedAt'>, startedAt: number) => state.data !== undefined && state.dataUpdatedAt < startedAt

/**
 * What the page shows of the start cache: `stale` while a query on screen still holds a cached answer, `refreshing`
 * while one of those is being fetched again, `failed` once one could not be, as its fetch failed or waits for a network.
 */
export type RestoredState = 'fresh' | 'refreshing' | 'stale' | 'failed'

export const restoredState = (queries: readonly Pick<Query, 'state'>[], startedAt: number): RestoredState => {
  const restored = queries.filter((query) => isRestored(query.state, startedAt))
  if (restored.length === 0) return 'fresh'
  if (restored.some((query) => query.state.status === 'error' || query.state.fetchStatus === 'paused')) return 'failed'
  if (restored.some((query) => query.state.fetchStatus === 'fetching')) return 'refreshing'
  return 'stale'
}

/** `restoredState` of the queries on screen, kept up to date as they refresh. */
export const useRestoredState = () => {
  const cache = useQueryClient().getQueryCache()
  const startedAt = useContext(ClientStartContext)
  const subscribe = useCallback((changed: () => void) => cache.subscribe(changed), [cache])
  const read = useCallback(() => restoredState(cache.findAll({ type: 'active' }), startedAt), [cache, startedAt])
  return useSyncExternalStore(subscribe, read, read)
}
