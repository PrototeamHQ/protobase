import type { QueryClient } from '@tanstack/react-query'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import type { Client } from '@protobase/client'
import type { GridRow } from '../data-grid'
import { gridPageSize } from '../data-grid'
import { keys } from '../data/query-keys'
import { recordId } from './model-helpers'
import { loadRelatedColumn, type RelatedColumnLoad } from './related-column-rows'
import { listLabels, withLabels } from './relation-labels'
import { listPhotos, withPhotos } from './row-photos'
import { seedTitleRows } from './title-rows'

export type GridLoaderOptions = {
  queryClient: QueryClient
  client: Client
  resources: Record<string, ResourceModel>
  views: Record<string, ViewModel>
  model: ResourceModel
  columns: string[]
  filter: string
  orderBy: string
  /** Related columns whose records each page loads with its rows, under the column's name. */
  related?: RelatedColumnLoad[]
}

const exactBelow = 5000

/** One cached page; `nextPageToken` continues to the page after it, so a later loader on the same cache keeps the cursor. */
export type LoadedPage = { rows: GridRow[]; total: number; nextPageToken: string }

/**
 * Loads fixed-size pages by number. The page after a cached or loading one follows that page's `next_page_token`; a
 * jump to a page whose predecessor is neither asks `:seek` for the page at that row position, so the pages of one jump
 * are read on from a single seek. Every page is cached by TanStack Query, with the records of its related columns; the
 * fields the derived titles of the records its relations point at read are cached per record (see `seedTitleRows`).
 */
export const createGridLoader = ({ queryClient, client, resources, views, model, columns, filter, orderBy, related = [] }: GridLoaderOptions) => {
  // A page with related columns holds more than the same rows without, which an embedded list of them loads
  const relatedNames = related.map((load) => load.column.name).join(',')
  const pageKey = (number: number) => (related.length === 0 ? keys.page(model.name, filter, orderBy, gridPageSize, number) : [...keys.page(model.name, filter, orderBy, gridPageSize, number), relatedNames])
  const labels = listLabels(resources, views, model, columns)
  const photos = listPhotos(views[model.name])

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
    const params = { filter, orderBy, pageSize: gridPageSize, labels, photos }
    const result =
      token !== undefined
        ? await client.list(model.name, { ...params, pageToken: token })
        : await client.seek(model.name, { ...params, position: page * gridPageSize })
    if (result.items.length === 0 && page > 0) return { rows: [], total: 0, nextPageToken: '' }
    const ids = result.items.map((record) => recordId(model, record))
    const labelled = withLabels(resources, model, columns, withPhotos(model, result.items, result.photos), result.labels)
    const [shown] = await Promise.all([
      Promise.all(related.map((load) => loadRelatedColumn({ client, resources, views, load, owners: ids }))),
      seedTitleRows(queryClient, client, resources, views, model, columns, result.items),
    ])
    const rows = labelled.map((record, index) => ({
      ...record,
      ...Object.fromEntries(related.map((load, column) => [load.column.name, shown[column]!.get(ids[index]!) ?? []])),
      id: ids[index]!,
    }))
    return { rows, total: page === 0 ? await firstPageTotal(result) : result.totalSizeEstimate, nextPageToken: result.nextPageToken }
  }

  const page = (number: number): Promise<LoadedPage> =>
    queryClient.fetchQuery({ queryKey: pageKey(number), staleTime: 60_000, queryFn: () => fetchPage(number) })

  const loadRows = async (start: number) => (await page(Math.floor(start / gridPageSize))).rows

  return { page, loadRows }
}
