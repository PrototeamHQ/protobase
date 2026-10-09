import type { QueryClient } from '@tanstack/react-query'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import type { Client } from '@protobase/client'
import type { GridRow } from '../data-grid'
import { gridPageSize } from '../data-grid'
import { keys } from '../data/query-keys'
import { recordId } from './model-helpers'
import { withLabels } from './relation-labels'

export type GridLoaderOptions = {
  queryClient: QueryClient
  client: Client
  resources: Record<string, ResourceModel>
  views: Record<string, ViewModel>
  model: ResourceModel
  columns: string[]
  filter: string
  orderBy: string
}

const exactBelow = 5000

export type LoadedPage = { rows: GridRow[]; total: number }

/**
 * Loads fixed-size pages by number. Sequential scrolling follows `next_page_token`; a jump asks `:seek` for the
 * page at that row position. Every page is cached by TanStack Query.
 */
export const createGridLoader = ({ queryClient, client, resources, views, model, columns, filter, orderBy }: GridLoaderOptions) => {
  const tokens = new Map<number, string>()

  /** The server's total is a planner estimate, off by a lot for small results; settle those exactly. */
  const firstPageTotal = async (result: { items: unknown[]; nextPageToken: string; totalSizeEstimate: number }) => {
    if (result.nextPageToken === '') return result.items.length
    if (result.totalSizeEstimate > exactBelow) return result.totalSizeEstimate
    return (await client.list(model.name, { filter, orderBy, pageSize: 1, count: 'exact' })).totalSize ?? result.totalSizeEstimate
  }

  const fetchPage = async (page: number): Promise<LoadedPage> => {
    const token = tokens.get(page)
    const params = { filter, orderBy, pageSize: gridPageSize }
    const result =
      page === 0 || token !== undefined
        ? await client.list(model.name, { ...params, pageToken: token ?? '' })
        : await client.seek(model.name, { ...params, position: page * gridPageSize })
    if (result.items.length === 0 && page > 0) return { rows: [], total: 0 }
    tokens.set(page + 1, result.nextPageToken)
    const ids = result.items.map((record) => recordId(model, record))
    const labelled = await withLabels(queryClient, client, resources, views, model, columns, result.items)
    return { rows: labelled.map((record, index) => ({ ...record, id: ids[index]! })), total: page === 0 ? await firstPageTotal(result) : result.totalSizeEstimate }
  }

  const page = (number: number) =>
    queryClient.fetchQuery({ queryKey: keys.page(model.name, filter, orderBy, gridPageSize, number), staleTime: 60_000, queryFn: () => fetchPage(number) })

  const loadRows = async (start: number) => (await page(Math.floor(start / gridPageSize))).rows

  return { page, loadRows }
}
