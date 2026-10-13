import type { QueryClient } from '@tanstack/react-query'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import type { Client } from '@protobase/client'
import type { GridRow } from '../data-grid'
import { gridPageSize } from '../data-grid'
import { keys } from '../data/query-keys'
import { recordId } from './model-helpers'
import { listLabels, withLabels } from './relation-labels'

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

/** One cached page; `nextPageToken` continues to the page after it, so a later loader on the same cache keeps the cursor. */
export type LoadedPage = { rows: GridRow[]; total: number; nextPageToken: string }

/**
 * Loads fixed-size pages by number. The page after a cached or loading one follows that page's `next_page_token`; a
 * jump to a page whose predecessor is neither asks `:seek` for the page at that row position, so the pages of one jump
 * are read on from a single seek. Every page is cached by TanStack Query.
 */
export const createGridLoader = ({ queryClient, client, resources, views, model, columns, filter, orderBy }: GridLoaderOptions) => {
  const pageKey = (number: number) => keys.page(model.name, filter, orderBy, gridPageSize, number)
  const labels = listLabels(resources, views, model, columns)

  /** The server's total is a planner estimate, off by a lot for small results; settle those exactly. */
  const firstPageTotal = async (result: { items: unknown[]; nextPageToken: string; totalSizeEstimate: number }) => {
    if (result.nextPageToken === '') return result.items.length
    if (result.totalSizeEstimate > exactBelow) return result.totalSizeEstimate
    return (await client.list(model.name, { filter, orderBy, pageSize: 1, count: 'exact' })).totalSize ?? result.totalSizeEstimate
  }

  /** The token that continues after the page before `number`, or undefined when that page is neither cached nor loading. */
  const tokenBefore = async (number: number) => {
    if (number === 0) return ''
    const key = pageKey(number - 1)
    const cached = queryClient.getQueryData<LoadedPage>(key)
    if (cached) return cached.nextPageToken
    if (queryClient.getQueryState(key)?.fetchStatus !== 'fetching') return undefined
    return (await page(number - 1)).nextPageToken
  }

  const fetchPage = async (page: number): Promise<LoadedPage> => {
    const token = await tokenBefore(page)
    if (page > 0 && token === '') return { rows: [], total: 0, nextPageToken: '' }
    const params = { filter, orderBy, pageSize: gridPageSize, labels }
    const result =
      token !== undefined
        ? await client.list(model.name, { ...params, pageToken: token })
        : await client.seek(model.name, { ...params, position: page * gridPageSize })
    if (result.items.length === 0 && page > 0) return { rows: [], total: 0, nextPageToken: '' }
    const ids = result.items.map((record) => recordId(model, record))
    const labelled = withLabels(resources, model, columns, result.items, result.labels)
    const rows = labelled.map((record, index) => ({ ...record, id: ids[index]! }))
    return { rows, total: page === 0 ? await firstPageTotal(result) : result.totalSizeEstimate, nextPageToken: result.nextPageToken }
  }

  const page = (number: number): Promise<LoadedPage> =>
    queryClient.fetchQuery({ queryKey: pageKey(number), staleTime: 60_000, queryFn: () => fetchPage(number) })

  const loadRows = async (start: number) => (await page(Math.floor(start / gridPageSize))).rows

  return { page, loadRows }
}
