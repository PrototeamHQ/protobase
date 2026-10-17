import { createWhere, printFilter, type RelatedColumnModel, type ResourceModel, type ViewModel } from '@protobase/schema'
import type { Client } from '@protobase/client'
import { listLabels, withLabels } from './relation-labels'

const where = createWhere()

/** The most join records, and the most records, a related column reads for one page of the list: the list API's largest page. */
export const maxRelatedRead = 500

/** A related column the list loads with its rows, and the fields of its records it loads: those its dots and cards show. */
export type RelatedColumnLoad = { column: RelatedColumnModel; fields: string[] }

type Row = Record<string, unknown>

// Both filters must hold; a single one stays as it is
const and = (...parts: Array<string | undefined>) => {
  const given = parts.filter((part): part is string => Boolean(part))
  return given.length === 1 ? given[0]! : given.map((part) => `(${part})`).join(' AND ')
}

const text = (value: unknown) => (value === null || value === undefined ? undefined : String(value))

/**
 * The records of each owner, in the order `records` come in: a record belongs to every owner one of whose `links`
 * (`[owner, value]`) holds its `field`'s value. A relation's value may come labelled as `{ id, name }`.
 */
export const groupByOwner = (links: Array<[string, string]>, records: Row[], field: string): Map<string, Row[]> => {
  const owners = new Map<string, Set<string>>()
  for (const [owner, value] of links) owners.set(value, (owners.get(value) ?? new Set()).add(owner))
  const grouped = new Map<string, Row[]>()
  for (const record of records) {
    const raw = record[field]
    const value = text(typeof raw === 'object' && raw !== null && 'id' in raw ? raw.id : raw)
    for (const owner of value === undefined ? [] : (owners.get(value) ?? [])) grouped.set(owner, [...(grouped.get(owner) ?? []), record])
  }
  return grouped
}

// The values the shown records' `field` is matched against, per owner: through the join records, or the owner's key itself
const linksOf = async (client: Client, resources: Record<string, ResourceModel>, column: RelatedColumnModel, owners: string[]): Promise<Array<[string, string]>> => {
  const through = column.through
  if (!through) return owners.map((owner) => [owner, owner])
  const via = resources[through.resource]
  const key = through.key ?? via?.primaryKey[0]
  if (!via || key === undefined) throw new Error(`The related column ${column.name} names a join resource the app does not have: ${through.resource}`)
  const page = await client.search(via.name, { filter: and(printFilter(where.in(through.field, owners)), through.filter), fields: [through.field, key], pageSize: maxRelatedRead })
  return page.items.flatMap((row) => {
    const owner = text(row[through.field])
    const value = text(row[key])
    return owner === undefined || value === undefined ? [] : [[owner, value] as [string, string]]
  })
}

/**
 * The records a related column shows for each of `owners`, the keys of one page of the list's rows: its join records in
 * one request, then the records they pick in another, in the column's order, their relations labelled.
 */
export const loadRelatedColumn = async ({ client, resources, views, load, owners }: { client: Client; resources: Record<string, ResourceModel>; views: Record<string, ViewModel>; load: RelatedColumnLoad; owners: string[] }) => {
  const { column, fields } = load
  const target = resources[column.resource]
  if (!target) throw new Error(`The related column ${column.name} shows a resource the app does not have: ${column.resource}`)
  if (owners.length === 0) return new Map<string, Row[]>()
  const links = await linksOf(client, resources, column, owners)
  const values = [...new Set(links.map(([, value]) => value))]
  if (values.length === 0) return new Map<string, Row[]>()
  const loaded = [...new Set([...target.primaryKey, column.field, column.status, ...fields])]
  const labels = listLabels(resources, views, target, loaded)
  const page = await client.search(target.name, {
    filter: and(printFilter(where.in(column.field, values)), column.filter),
    ...(column.sort && { orderBy: column.sort }),
    fields: loaded,
    pageSize: maxRelatedRead,
    labels,
  })
  return groupByOwner(links, withLabels(resources, target, loaded, page.items, page.labels), column.field)
}
