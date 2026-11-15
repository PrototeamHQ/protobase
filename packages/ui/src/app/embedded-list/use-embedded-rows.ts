import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { Client } from '@protobase/client'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { useClient } from '../../data/api-provider'
import { keys } from '../../data/query-keys'
import type { GridRow } from '../../data-grid'
import { recordId } from '../../live/model-helpers'
import { listLabels, withLabels } from '../../live/relation-labels'
import { listPhotos, withPhotos } from '../../live/row-photos'
import { seedTitleRows } from '../../live/title-rows'
import { useAdminMeta } from '../meta-gate'

export type EmbeddedRowsRequest = {
  model: ResourceModel
  filter: string
  orderBy: string
  limit: number
  /** The fields its relations are labelled and its relations' titles read for. */
  fields: string[]
  /** The fields each record is read with, from `embeddedReadFields`; `undefined` reads whole records. */
  read: string[] | undefined
}

/** What `embeddedRowsQuery` reads with beside the request: the API, the query cache its titles are seeded into, and the app's models. */
type Reader = { client: Client; queryClient: QueryClient; resources: Record<string, ResourceModel>; views: Record<string, ViewModel> }

/**
 * The first `limit` records in `orderBy` order, with the fields `read` names, as the list page's table and displays get them: relations among
 * `fields` as `{ id, name }`, named in the same call, with the photos of its cards, and how many records match in all,
 * counted in the same call: `estimated` when more than the server counts exactly match; the fields the derived titles
 * of the records its relations point at read, in one more call per resource. A filter through a join
 * resource may hold hundreds of keys, so it goes in a JSON body.
 */
export const embeddedRowsQuery = ({ client, queryClient, resources, views }: Reader, { model, filter, orderBy, limit, fields, read }: EmbeddedRowsRequest) => ({
  queryKey: [...keys.list(model.name, filter, orderBy, limit, 'embedded'), fields.join(','), read?.join(',') ?? '*'],
  queryFn: async (): Promise<{ rows: GridRow[]; total: number; estimated: boolean }> => {
    const labels = listLabels(resources, views, model, fields)
    const photos = listPhotos(views[model.name])
    const page = await client.search(model.name, { filter: filter || undefined, orderBy: orderBy || undefined, pageSize: limit, count: 'exact', labels, photos, fields: read })
    await seedTitleRows(queryClient, client, resources, views, model, fields, page.items)
    const labelled = withLabels(resources, model, fields, withPhotos(model, page.items, page.photos), page.labels)
    const rows = labelled.map((row, index) => ({ ...row, id: recordId(model, page.items[index]!) }))
    // The last page holds them all
    if (page.nextPageToken === '') return { rows, total: rows.length, estimated: false }
    return { rows, total: page.totalSize ?? page.totalSizeEstimate, estimated: page.totalSize === undefined }
  },
})

/** The rows of `embeddedRowsQuery`, the page before staying while the next loads; nothing is read while not `enabled`. */
export const useEmbeddedRows = (request: EmbeddedRowsRequest, enabled = true) => {
  const { resources, views } = useAdminMeta()
  return useQuery({ ...embeddedRowsQuery({ client: useClient(), queryClient: useQueryClient(), resources, views }, request), placeholderData: keepPreviousData, enabled })
}
