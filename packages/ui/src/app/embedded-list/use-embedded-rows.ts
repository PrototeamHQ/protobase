import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ResourceModel } from '@protobase/schema'
import { useClient } from '../../data/api-provider'
import { keys } from '../../data/query-keys'
import type { GridRow } from '../../data-grid'
import { recordId } from '../../live/model-helpers'
import { listLabels, withLabels } from '../../live/relation-labels'
import { useAdminMeta } from '../meta-gate'

type Request = { model: ResourceModel; filter: string; orderBy: string; limit: number; fields: string[] }

/**
 * The first `limit` records in `orderBy` order, as the list page's table and displays get them: relations among
 * `fields` as `{ id, name }`, named in the same call. A filter through a join resource may hold hundreds of keys, so it
 * goes in a JSON body.
 */
export const useEmbeddedRows = ({ model, filter, orderBy, limit, fields }: Request) => {
  const client = useClient()
  const { resources, views } = useAdminMeta()
  return useQuery({
    queryKey: [...keys.list(model.name, filter, orderBy, limit, 'embedded'), fields.join(',')],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<GridRow[]> => {
      const labels = listLabels(resources, views, model, fields)
      const page = await client.search(model.name, { filter: filter || undefined, orderBy: orderBy || undefined, pageSize: limit, labels })
      const labelled = withLabels(resources, model, fields, page.items, page.labels)
      return labelled.map((row, index) => ({ ...row, id: recordId(model, page.items[index]!) }))
    },
  })
}
