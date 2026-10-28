import type { QueryClient } from '@tanstack/react-query'
import { createWhere, printFilter, type ResourceModel, type ViewModel } from '@protobase/schema'
import type { Client } from '@protobase/client'
import { keys } from '../data/query-keys'

const where = createWhere()

type Row = Record<string, unknown>

/** The fields a derived title reads, when a single-key `target`'s view derives its titles from fields the reader may read. */
export const derivedTitleFields = (target: ResourceModel, view: ViewModel | undefined) => {
  const from = view?.titleFrom
  if (!from || from.unreadable || target.primaryKey.length !== 1) return
  return from.fields
}

/** Where the fields a record's derived title reads are cached, `{ row }` with `row` null for a record not found. */
export const titleRowKey = (target: ResourceModel, id: string, fields: string[]) => keys.titleRow(target.name, id, fields.join(','))

/** The key and `fields` of the records `ids` of `target`, in one list call, by key. */
export const readTitleRows = async (client: Client, target: ResourceModel, fields: string[], ids: string[]) => {
  const keyField = target.primaryKey[0]!
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map<string, Row>()
  const page = await client.list(target.name, { filter: printFilter(where.in(keyField, unique)), fields: [keyField, ...fields], pageSize: unique.length })
  return new Map(page.items.map((item) => [String(item[keyField]), item]))
}

/**
 * Reads, for one page of `rows`, the fields the derived titles of the records their relations among `columns` point at
 * read: one list call per target resource, each record cached under its `titleRowKey`, so the cells titling them for
 * the reader ask nothing more.
 */
export const seedTitleRows = async (
  queryClient: QueryClient,
  client: Client,
  resources: Record<string, ResourceModel>,
  views: Record<string, ViewModel>,
  model: ResourceModel,
  columns: string[],
  rows: Row[],
) => {
  const ids = new Map<string, string[]>()
  for (const name of columns) {
    const field = model.fields[name]
    const target = field?.type === 'relation' && field.relation ? resources[field.relation.resource] : undefined
    if (!target || !derivedTitleFields(target, views[target.name])) continue
    const values = rows.flatMap((row) => (row[name] == null ? [] : [String(row[name])]))
    ids.set(target.name, [...(ids.get(target.name) ?? []), ...values])
  }
  await Promise.all(
    [...ids].map(async ([name, wanted]) => {
      const target = resources[name]!
      const fields = derivedTitleFields(target, views[name])!
      const found = await readTitleRows(client, target, fields, wanted)
      for (const id of new Set(wanted)) queryClient.setQueryData(titleRowKey(target, id, fields), { row: found.get(id) ?? null })
    }),
  )
}
