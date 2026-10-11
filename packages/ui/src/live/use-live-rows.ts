import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { useClient } from '../data/api-provider'
import { keys } from '../data/query-keys'
import type { RowSource } from '../data-grid'
import { createGridLoader } from './grid-loader'

export type LiveRowsParams = {
  resources: Record<string, ResourceModel>
  views: Record<string, ViewModel>
  model: ResourceModel
  columns: string[]
  filter: string
  orderBy: string
}

/**
 * A grid row source backed by the API; `total` is the server's estimate from the first page. `page` loads one page of
 * the same rows by number, and `key` names them in the query cache, for list displays that page through them.
 */
export const useLiveRows = ({ resources, views, model, columns, filter, orderBy }: LiveRowsParams) => {
  const client = useClient()
  const queryClient = useQueryClient()
  const columnKey = columns.join(',')
  const loader = useMemo(
    () => createGridLoader({ queryClient, client, resources, views, model, columns, filter, orderBy }),
    [queryClient, client, resources, views, model, columnKey, filter, orderBy],
  )
  const first = useQuery({ queryKey: [...keys.first(model.name, filter, orderBy), columnKey], queryFn: () => loader.page(0) })
  const source = useMemo<RowSource | undefined>(
    () => (first.data ? { total: first.data.total, loadRows: loader.loadRows } : undefined),
    [first.data, loader],
  )
  return { source, error: first.error, isLoading: first.isLoading, page: loader.page, key: [...keys.first(model.name, filter, orderBy), columnKey] as const }
}
