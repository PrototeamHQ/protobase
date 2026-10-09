import { useQueries, useQueryClient } from '@tanstack/react-query'
import type { ResourceModel } from '@protobase/schema'
import { useClient } from '../../data/api-provider'
import { keys } from '../../data/query-keys'
import { fetchLabels, type Labels } from '../../live/relation-labels'
import { useAdminMeta } from '../meta-gate'

/** Names for the relation columns of the rows on screen, one list call per column, by column then key. */
export const useRelationLabels = (model: ResourceModel, columns: string[], rows: Array<Record<string, unknown>>): Map<string, Labels> => {
  const { resources, views } = useAdminMeta()
  const client = useClient()
  const queryClient = useQueryClient()
  const relations = columns.flatMap((name) => {
    const field = model.fields[name]
    const target = field?.type === 'relation' && field.relation ? resources[field.relation.resource] : undefined
    if (!target || target.primaryKey.length !== 1) return []
    const ids = [...new Set(rows.flatMap((row) => (row[name] === null || row[name] === undefined ? [] : [String(row[name])])))].sort()
    return ids.length > 0 ? [{ name, target, ids }] : []
  })
  const results = useQueries({
    queries: relations.map(({ target, ids }) => ({
      queryKey: keys.labelMap(target.name, ids.join(',')),
      queryFn: () => fetchLabels(queryClient, client, target, ids, views[target.name]),
    })),
  })
  return new Map(relations.flatMap(({ name }, index) => (results[index]?.data ? [[name, results[index].data] as const] : [])))
}
