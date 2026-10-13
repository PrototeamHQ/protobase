import { printFilter, type CardPhotosModel, type FilterExpr } from '@protobase/schema'

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
  /**
   * Brings each record's first photos in the same answer, as a cards display's `photos` names them: the `image` of the
   * records of `resource` whose relation `field` points at it, in `sort` order, at most ten. The caller gets those they
   * could list themselves.
   */
  photos?: CardPhotosModel
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
  /** As a list's `photos`. */
  photos?: CardPhotosModel
}

export const filterText = (filter: FilterInput | undefined) => (typeof filter === 'string' ? filter : filter && printFilter(filter))

type Wire = Record<string, string | number | undefined>

/** `labels` as the API takes it: `relation.field` entries. */
export const labelEntries = (labels: Record<string, string> | undefined) => {
  const entries = Object.entries(labels ?? {}).map(([relation, field]) => `${relation}.${field}`)
  return entries.length > 0 ? entries : undefined
}

/** `photos` as the API takes it: a `resource.field.image` entry and the order of the photos. */
export const photosWire = (photos: CardPhotosModel | undefined) => ({
  photos: photos && `${photos.resource}.${photos.field}.${photos.image}`,
  photos_order_by: photos?.sort,
})

/** The snake_case parameters of `GET /{resource}` and the body of `POST /{resource}:search`. */
export const listWire = (params: ListParams = {}) => ({
  filter: filterText(params.filter) || undefined,
  order_by: params.orderBy,
  page_size: params.pageSize,
  page_token: params.pageToken || undefined,
  fields: params.fields?.join(','),
  labels: labelEntries(params.labels)?.join(','),
  ...photosWire(params.photos),
  count: params.count,
})

export const queryString = (wire: Wire) => {
  const search = new URLSearchParams()
  for (const [name, value] of Object.entries(wire)) if (value !== undefined) search.set(name, String(value))
  const text = search.toString()
  return text ? `?${text}` : ''
}
