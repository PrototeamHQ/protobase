import { useQueries } from '@tanstack/react-query'
import { printFilter, createWhere, type ResourceModel } from '@protobase/schema'
import { useClient } from '../data/api-provider'
import { keys } from '../data/query-keys'
import type { IncomingRelation } from './incoming-relations'

const where = createWhere()

/** How many records point at `key` through each relation: `undefined` while loading, left out when the list is refused. */
export const useIncomingCounts = (relations: IncomingRelation[], resources: Record<string, ResourceModel>, key: string) => {
  const client = useClient()
  const counts = useQueries({
    queries: relations.map((relation) => {
      const filter = printFilter(where.eq(relation.field, key))
      return {
        queryKey: keys.list(relation.resource, filter, '', 1, 'incoming'),
        queryFn: async () => {
          const page = await client.list(relation.resource, { filter, pageSize: 1, count: 'exact', fields: resources[relation.resource]!.primaryKey })
          return { count: page.totalSize ?? page.totalSizeEstimate, exact: page.totalSize !== undefined }
        },
      }
    }),
  })
  return relations.flatMap((relation, index) => {
    const result = counts[index]!
    if (result.error) return []
    return [{ relation, count: result.data }]
  })
}
