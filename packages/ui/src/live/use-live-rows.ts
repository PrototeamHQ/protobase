import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { useClient } from '../data/api-provider'
import { keys } from '../data/query-keys'
import type { RowSource } from '../data-grid'
import { createGridLoader } from './grid-loader'
import type { RelatedColumnLoad } from './related-column-rows'

export type LiveRowsParams = {
  resources: Record<string, ResourceModel>
  views: Record<string, ViewModel>
  model: ResourceModel
  columns: string[]
  filter: string
  orderBy: string
  /** Related columns loaded with each page of rows. */
  related?: RelatedColumnLoad[]
}

/**
 * A grid row source backed by the API; `total` is the server's estimate from the first page. `page` loads one page of
 * the same rows by number, and `key` names them in the query cache, for list displays that page through them. Each
 * fetch of the first page, as on a return to the window, makes every page of the list stale and gives the source a new
 * `revision`, so the rows on screen are loaded again.
 */
export const useLiveRows = ({ resources, views, model, columns, filter, orderBy, related }: LiveRowsParams) => {
  const client = useClient()
  const queryClient = useQueryClient()
  const columnKey = columns.join(',')
  const relatedKey = JSON.stringify(related ?? [])
  const loader = useMemo(
    () => createGridLoader({ queryClient, client, resources, views, model, columns, filter, orderBy, ...(related && { related }) }),
    [queryClient, client, resources, views, model, columnKey, filter, orderBy, relatedKey],
  )
  const first = useQuery({
    queryKey: [...keys.first(model.name, filter, orderBy), columnKey],
    queryFn: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.pages(model.name, filter, orderBy), refetchType: 'none' })
      return loader.page(0)
    },
  })
  const source = useMemo<RowSource | undefined>(
    () => (first.data ? { total: first.data.total, loadRows: loader.loadRows, revision: first.dataUpdatedAt } : undefined),
    [first.data, first.dataUpdatedAt, loader],
  )
  return { source, error: first.error, isLoading: first.isLoading, page: loader.page, key: [...keys.first(model.name, filter, orderBy), columnKey] as const }
}
