import { useQueries, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import type { ListPage } from '@protobase/client'
import type { ResourceModel } from '@protobase/schema'
import type { NavRecent } from '../app-shell'
import { useClient } from '../data/api-provider'
import type { MetaData } from '../data/meta-data'
import { keys } from '../data/query-keys'
import { recentRecords, recentRequest, recentRowDiffers } from './nav-recent'
import { userMenuResources } from './user-menu-from-meta'

type Group = { model: ResourceModel; request: ReturnType<typeof recentRequest> }

const groupKey = ({ model, request }: Group) => keys.navRecent(model.name, request.filter, request.orderBy, request.pageSize)

/**
 * Refetches a group when a record of its resource is read anew (a record page, or an app following one) and shows
 * something else than the group's row of it, so the sidebar follows the record without waiting for a write or focus.
 */
const useFollowRecords = (groups: Group[]) => {
  const queryClient = useQueryClient()
  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((event) => {
        if (event.type !== 'updated' || event.action.type !== 'success') return
        const [scope, resource, key] = event.query.queryKey
        const record = (event.action.data as { record?: Record<string, unknown> } | undefined)?.record
        if (scope !== 'record' || typeof key !== 'string' || !record) return
        for (const group of groups) {
          if (group.model.name !== resource) continue
          const page = queryClient.getQueryData<ListPage<Record<string, unknown>>>(groupKey(group))
          if (page && recentRowDiffers(group.model, group.request.fields, page.items, key, record)) void queryClient.invalidateQueries({ queryKey: groupKey(group), exact: true })
        }
      }),
    [queryClient, groups],
  )
}

/**
 * The records of every sidebar group (`nav.recent`), one list request each, under the `list` query key so that any
 * write to the resource refreshes them, as does reading one of their records anew. The server applies the caller's
 * access, as on the list page.
 */
export const useNavRecent = (meta: MetaData, basePath: string, active: { resource?: string; key?: string }): Record<string, NavRecent> => {
  const client = useClient()
  const groups = useMemo(() => {
    const inMenu = userMenuResources(meta)
    return Object.values(meta.views).flatMap((view) => {
      const model = meta.resources[view.resource]
      const recent = view.nav?.recent
      return model && recent && !view.nav?.hidden && !inMenu.has(model.name) ? [{ model, view, recent, request: recentRequest(model, view, recent) }] : []
    })
  }, [meta])
  useFollowRecords(groups)
  const results = useQueries({
    queries: groups.map((group) => ({
      queryKey: groupKey(group),
      queryFn: () => client.list(group.model.name, group.request),
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
