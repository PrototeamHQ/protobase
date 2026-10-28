import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ResourceModel } from '@protobase/schema'
import { useClient } from '../../data/api-provider'
import { keys } from '../../data/query-keys'
import type { GridRow } from '../../data-grid'
import { recordId } from '../../live/model-helpers'
import { listLabels, withLabels } from '../../live/relation-labels'
import { listPhotos, withPhotos } from '../../live/row-photos'
import { seedTitleRows } from '../../live/title-rows'
import { useAdminMeta } from '../meta-gate'

type Request = { model: ResourceModel; filter: string; orderBy: string; limit: number; fields: string[] }

/**
 * The first `limit` records in `orderBy` order, as the list page's table and displays get them: relations among
 * `fields` as `{ id, name }`, named in the same call, with the photos of its cards, and how many records match in all,
 * counted in the same call: `estimated` when more than the server counts exactly match; the fields the derived titles
 * of the records its relations point at read, in one more call per resource. A filter through a join
 * resource may hold hundreds of keys, so it goes in a JSON body.
 */
export const useEmbeddedRows = ({ model, filter, orderBy, limit, fields }: Request) => {
  const client = useClient()
  const queryClient = useQueryClient()
  const { resources, views } = useAdminMeta()
  return useQuery({
    queryKey: [...keys.list(model.name, filter, orderBy, limit, 'embedded'), fields.join(',')],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ rows: GridRow[]; total: number; estimated: boolean }> => {
      const labels = listLabels(resources, views, model, fields)
      const photos = listPhotos(views[model.name])
      const page = await client.search(model.name, { filter: filter || undefined, orderBy: orderBy || undefined, pageSize: limit, count: 'exact', labels, photos })
      await seedTitleRows(queryClient, client, resources, views, model, fields, page.items)
      const labelled = withLabels(resources, model, fields, withPhotos(model, page.items, page.photos), page.labels)
      const rows = labelled.map((row, index) => ({ ...row, id: recordId(model, page.items[index]!) }))
      // The last page holds them all
      if (page.nextPageToken === '') return { rows, total: rows.length, estimated: false }
      return { rows, total: page.totalSize ?? page.totalSizeEstimate, estimated: page.totalSize === undefined }
    },
  })
}
