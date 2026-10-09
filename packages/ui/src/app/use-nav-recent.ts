import { useQueries } from '@tanstack/react-query'
import type { NavRecent } from '../app-shell'
import { useClient } from '../data/api-provider'
import type { MetaData } from '../data/meta-data'
import { keys } from '../data/query-keys'
import { recentRecords, recentRequest } from './nav-recent'
import { userMenuResources } from './user-menu-from-meta'

/**
 * The records of every sidebar group (`nav.recent`), one list request each, under the `list` query key so that any
 * write to the resource refreshes them. The server applies the caller's access, as on the list page.
 */
export const useNavRecent = (meta: MetaData, basePath: string, active: { resource?: string; key?: string }): Record<string, NavRecent> => {
  const client = useClient()
  const inMenu = userMenuResources(meta)
  const groups = Object.values(meta.views).flatMap((view) => {
    const model = meta.resources[view.resource]
    const recent = view.nav?.recent
    return model && recent && !view.nav?.hidden && !inMenu.has(model.name) ? [{ model, view, recent, request: recentRequest(model, view, recent) }] : []
  })
  const results = useQueries({
    queries: groups.map(({ model, request }) => ({
      queryKey: keys.navRecent(model.name, request.filter, request.orderBy, request.pageSize),
      queryFn: () => client.list(model.name, request),
      // Statuses change elsewhere too (other users, background jobs); the app's default is not to refetch on focus.
      refetchOnWindowFocus: true,
    })),
  })
  return Object.fromEntries(
    groups.map(({ model, view, recent }, index) => {
      const result = results[index]!
      if (result.isPending) return [model.name, { state: 'loading' }]
      if (result.isError) return [model.name, { state: 'error' }]
      const activeKey = active.resource === model.name ? active.key : undefined
      return [model.name, { state: 'ready', records: recentRecords(model, view, recent, result.data.items, basePath, activeKey) }]
    }),
  )
}
