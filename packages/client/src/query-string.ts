import { printFilter, type FilterExpr } from '@protobase/schema'

export type FilterInput = string | FilterExpr

export type ListParams = {
  filter?: FilterInput
  /** AIP-132 text, for example `created_at desc`. */
  orderBy?: string
  pageSize?: number
  pageToken?: string
  fields?: string[]
  /**
   * Names the records relations point at, in the same answer: `{ place_id: 'name' }` gives each place's `name` in the
   * page's `labels`. A record the caller cannot list, or whose field they cannot read, has no name there.
   */
  labels?: Record<string, string>
  count?: 'exact'
}

/** What `map` asks for: the fields of the position, the map's zoom, and the bounding box in `filter`. */
export type MapParams = {
  latitude: string
  longitude: string
  zoom: number
  filter?: FilterInput
  orderBy?: string
  fields?: string[]
  /** As a list's `labels`. */
  labels?: Record<string, string>
}

export const filterText = (filter: FilterInput | undefined) => (typeof filter === 'string' ? filter : filter && printFilter(filter))

type Wire = Record<string, string | number | undefined>

/** `labels` as the API takes it: `relation.field` entries. */
export const labelEntries = (labels: Record<string, string> | undefined) => {
  const entries = Object.entries(labels ?? {}).map(([relation, field]) => `${relation}.${field}`)
  return entries.length > 0 ? entries : undefined
}

/** The snake_case parameters of `GET /{resource}` and the body of `POST /{resource}:search`. */
export const listWire = (params: ListParams = {}) => ({
  filter: filterText(params.filter) || undefined,
  order_by: params.orderBy,
  page_size: params.pageSize,
  page_token: params.pageToken || undefined,
  fields: params.fields?.join(','),
  labels: labelEntries(params.labels)?.join(','),
  count: params.count,
})

export const queryString = (wire: Wire) => {
  const search = new URLSearchParams()
  for (const [name, value] of Object.entries(wire)) if (value !== undefined) search.set(name, String(value))
  const text = search.toString()
  return text ? `?${text}` : ''
}
