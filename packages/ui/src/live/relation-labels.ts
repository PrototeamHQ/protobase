import type { QueryClient } from '@tanstack/react-query'
import { createWhere, printFilter, type ResourceModel, type ViewModel } from '@protobase/schema'
import type { Client } from '@protobase/client'
import { keys } from '../data/query-keys'
import { labelFieldOf } from './model-helpers'

const where = createWhere()

export type Labels = Map<string, string>

/** Names for the given keys of a single-key resource, fetched in one list call and cached. */
export const fetchLabels = async (queryClient: QueryClient, client: Client, target: ResourceModel, ids: string[], view?: ViewModel): Promise<Labels> => {
  const keyField = target.primaryKey[0]!
  const unique = [...new Set(ids)].sort()
  if (unique.length === 0 || target.primaryKey.length !== 1) return new Map()
  const labelField = labelFieldOf(target, view)
  const entries = await queryClient.fetchQuery({
    queryKey: keys.labels(target.name, unique.join(',')),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const page = await client.list(target.name, {
        filter: printFilter(where.in(keyField, unique)),
        fields: [keyField, labelField],
        pageSize: unique.length,
      })
      return page.items.map((item): [string, string] => [String(item[keyField]), String(item[labelField])])
    },
  })
  return new Map(entries)
}

/** Replaces each relation value with `{ id, name }` so grid cells can show the name. */
export const withLabels = async (
  queryClient: QueryClient,
  client: Client,
  resources: Record<string, ResourceModel>,
  views: Record<string, ViewModel>,
  model: ResourceModel,
  columns: string[],
  rows: Array<Record<string, unknown>>,
) => {
  const relations = columns.flatMap((name) => {
    const field = model.fields[name]
    const target = field?.type === 'relation' && field.relation ? resources[field.relation.resource] : undefined
    return target ? [{ name, target }] : []
  })
  const resolved = await Promise.all(
    relations.map(async ({ name, target }) => {
      const ids = rows.flatMap((row) => (row[name] == null ? [] : [String(row[name])]))
      return [name, await fetchLabels(queryClient, client, target, ids, views[target.name])] as const
    }),
  )
  const labels = new Map(resolved)
  return rows.map((row) => {
    const next = { ...row }
    for (const [name, names] of labels) {
      if (row[name] == null) continue
      next[name] = { id: row[name], name: names.get(String(row[name])) ?? String(row[name]) }
    }
    return next
  })
}
