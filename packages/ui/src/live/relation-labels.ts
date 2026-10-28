import type { QueryClient } from '@tanstack/react-query'
import { createWhere, printFilter, type ResourceModel, type ViewModel } from '@protobase/schema'
import type { Client, RelatedLabels } from '@protobase/client'
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

const relationColumns = (resources: Record<string, ResourceModel>, model: ResourceModel, columns: string[]) =>
  columns.flatMap((name) => {
    const field = model.fields[name]
    const target = field?.type === 'relation' && field.relation ? resources[field.relation.resource] : undefined
    return target ? [{ name, target }] : []
  })

/**
 * What a list call asks `labels` for: each relation among `columns` to a single-key resource, by the field that names its
 * records. A resource whose view derives its titles per reader is named by the browser instead, so none is asked for it.
 */
export const listLabels = (resources: Record<string, ResourceModel>, views: Record<string, ViewModel>, model: ResourceModel, columns: string[]) =>
  Object.fromEntries(
    relationColumns(resources, model, columns)
      .filter(({ target }) => target.primaryKey.length === 1 && !views[target.name]?.titleFrom)
      .map(({ name, target }) => [name, labelFieldOf(target, views[target.name])]),
  )

/** Replaces each relation value among `columns` with `{ id, name }`, named by the list call's `labels`, else by its key. */
export const withLabels = (
  resources: Record<string, ResourceModel>,
  model: ResourceModel,
  columns: string[],
  rows: Array<Record<string, unknown>>,
  labels: RelatedLabels = {},
) => {
  const relations = relationColumns(resources, model, columns)
  return rows.map((row) => {
    const next = { ...row }
    for (const { name } of relations) {
      if (row[name] == null) continue
      next[name] = { id: row[name], name: labels[name]?.[String(row[name])] ?? String(row[name]) }
    }
    return next
  })
}
