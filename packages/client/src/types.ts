import type { PageModel } from '@protobase/layout'
import type { BottomBarModel, InferRecord, ResourceModel, SignInViewModel, UserMenuModel, ViewModel } from '@protobase/schema'

/** A resource by name, or the builder from `resource(...)`, which carries its record type. */
export type ResourceRef = string | { readonly $fields: unknown; toModel(): ResourceModel }

/** Records as they travel: dates are ISO text, 64-bit integers and decimals are strings. */
export type RecordOf<R extends ResourceRef> = R extends { readonly $fields: unknown }
  ? InferRecord<R>
  : Record<string, unknown>

/** Per relation, the names of the records it points at, by key as text; a record without one is absent. */
export type RelatedLabels = Record<string, Record<string, string>>

/** Per record, by key as text, the files of its first photos in their order; a record without any is absent. */
export type RecordPhotos = Record<string, StoredFile[]>

/** One change of a record, as `history` reads it: only the fields the caller may read. */
export type HistoryChange = {
  id: string
  /** When its transaction started, ISO 8601. */
  at: string
  operation: 'create' | 'update' | 'delete' | 'undelete'
  /** The fields an update changed, sensitive ones included; none for a create or delete. */
  changed: string[]
  /** The fields before and after, without sensitive and file fields; none before a create, or after a delete. */
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  /** Who made it through the API, with their name when the server knows it; `null` for a write from elsewhere. */
  actor: { id: string; name?: string } | null
  /** The database role that wrote; `null` when unknown. */
  databaseRole: string | null
}

/** A page of a record's history, newest first. */
export type HistoryPage = {
  items: HistoryChange[]
  /** `""` on the last page. */
  nextPageToken: string
}

export type ListPage<T> = {
  items: T[]
  /** `""` on the last page. */
  nextPageToken: string
  /** Only from `seek`; `""` on the first page. */
  prevPageToken?: string
  totalSizeEstimate: number
  /** Only with `count: 'exact'`, and when at most 10,000 records match; `totalSizeEstimate` stands above that. */
  totalSize?: number
  /** Only with `labels`: per relation, the names of the records it points at, by key as text. */
  labels?: RelatedLabels
  /** Only with `photos`: each record's first photos, by key as text. */
  photos?: RecordPhotos
  /** `X-Protobase-Warning`, for example a scan-guard notice. */
  warning?: string
}

/** `label`: with the `label` option, the name of the record a relation's value points at, when the caller may read it. */
export type Facet = { value: string | number | boolean | null; count: number; label?: string }

export type SeriesPoint = { bucket: string; count: number }

export type Series = { field: string; granularity: string; timeZone: string; points: SeriesPoint[] }

export type SeriesParams = {
  field: string
  range?: '7d' | '30d' | '90d' | '1y' | 'all'
  from?: string
  to?: string
  granularity?: 'hour' | 'day' | 'week' | 'month'
  timeZone?: string
}

export type HistogramBucket = { from: number; to: number; count: number }

export type Histogram = { min: number | null; max: number | null; buckets: HistogramBucket[] }

/** The corners around some records, in decimal degrees. */
export type MapBounds = { south: number; west: number; north: number; east: number }

/** The records in one cell of a map's grid: how many, their mean position, and the bounds around them. */
export type MapBucket = { count: number; latitude: number; longitude: number; bounds: MapBounds }

/** The records `map` answers, or buckets of them when many match, never both; `totalSize` counts the matches. */
export type MapResult<T> = { items: T[]; buckets: MapBucket[]; totalSize: number; labels?: RelatedLabels; photos?: RecordPhotos }

/** What the signed-in user may do with a resource; `conditional` operations are decided per record by the server. */
export type ResourcePermissions = { read?: boolean; create: boolean; update: boolean; delete: boolean; conditional: Array<'create' | 'update' | 'delete'> }

/**
 * `assistant`: the assistant backend, for a caller with the `admin` or `ai` role when the app has one.
 * `runtime`: the runtime updates endpoint, for a caller with the `admin` role when the app has one.
 * `signIn`: for a visitor who is not signed in, the resources they could use once signed in, with what to tell them.
 * `bottomBar`: the tabs on phones, of the bottom bar that names the caller's active role.
 * `maps`: the map style the admin app draws maps with, and the layers of raster tiles its maps may switch to.
 * `files`: the hosts besides the page's own whose images the admin app draws with the page's referrer.
 * `plugins`: the plugins the admin app loads for the caller, each by its plugin.json.
 * `sources`: the other APIs whose resources the admin app draws for the caller.
 */
export type Meta = { resources: ResourceModel[]; views: ViewModel[]; pages?: PageModel[]; permissions?: Record<string, ResourcePermissions>; userMenu?: UserMenuModel; signIn?: SignInViewModel[]; bottomBar?: Omit<BottomBarModel, 'roles'>; assistant?: { url: string }; runtime?: { url: string }; errorReporting?: { dsn: string; environment?: string }; maps?: { style: string; layers?: MapLayerModel[] }; files?: { trustedHosts: string[] }; plugins?: PluginRef[]; sources?: SourceRef[] }

/**
 * A map of raster tiles a map may switch to in place of the style's: `tiles` is its URL with `{z}`, `{x}` and `{y}`,
 * `attribution` the credit shown while it is, `bounds` `[west, south, east, north]` where its tiles are.
 */
export type MapLayerModel = { id: string; label: string; tiles: string; attribution: string; bounds?: [number, number, number, number]; maxzoom?: number }

/** A plugin as `/meta` names it: the URL of its plugin.json, and the settings it reads with `usePlugin()`. */
export type PluginRef = { url: string; settings?: Record<string, unknown> }

/**
 * Another Protobase API as `/meta` names it: `url` is its resources API (`.../api/v1`), `label` its name as people read
 * it, and `resources` the ones the app draws from it, with its own `/meta` and data, at their own addresses.
 */
export type SourceRef = { url: string; label: string; resources: string[] }

export type MetaResult = { status: 'modified'; meta: Meta; etag: string } | { status: 'unchanged' }

/** What the caller may do with one record; `fields` maps each readable field to `edit` or `read`, hidden ones are absent. */
export type RecordPermissions = { update: boolean; delete: boolean; fields?: Record<string, 'edit' | 'read'> }

export type Stored<T> = { record: T; etag: string; permissions?: RecordPermissions }

/** A resized copy of an image, by the field's `.variants()`: its link and type, and the box it is resized into. */
export type StoredFileVariant = { url: string; type: string; width?: number; height?: number }

/**
 * A file field as records carry it. `url` downloads it: signed and valid one to two hours for a private file, permanent
 * for a public one, the URL itself for an external one. An image may have `variants` by name and a `placeholder`, its
 * ThumbHash in base64. Send `uri` back unchanged to keep the file, or `null` to clear it.
 */
export type StoredFile =
  | { uri: string; name: string; type: string; size?: number; url?: string; placeholder?: string; variants?: Record<string, StoredFileVariant> }
  | { uri: string; missing: true }

/** A reference to a record created earlier in the same batch (`ref` on its `create`). */
export type BatchRef = { $ref: string; field?: string }

type Key = string | number | readonly (string | number)[] | BatchRef

/**
 * One operation of `POST /api/v1:batchWrite`. The batch runs in a single transaction: either every operation is
 * applied or none is, and a failure names the operation that caused it.
 */
export type BatchOp =
  | { op: 'create'; resource: ResourceRef; data: Record<string, unknown>; ref?: string }
  | { op: 'update'; resource: ResourceRef; key: Key; data: Record<string, unknown>; etag?: string }
  | { op: 'delete'; resource: ResourceRef; key: Key; etag?: string }
  /** Renumbers `field` of the records so they sort in the order of `keys`; `etags` maps each key (as URL text) to its ETag. */
  | { op: 'reorder'; resource: ResourceRef; field: string; keys: Key[]; etags?: Record<string, string> }

/** One entry per operation, in order. A `reorder` lists every key in its final order with its new ETag. */
export type BatchOpResult =
  | { op: 'create'; resource: string; ref?: string; record: Record<string, unknown>; etag: string }
  | { op: 'update'; resource: string; record: Record<string, unknown>; etag: string }
  | { op: 'delete'; resource: string; deleted: true }
  | { op: 'reorder'; resource: string; records: Array<{ record: Record<string, unknown>; etag: string }> }

export type BatchResult = { results: BatchOpResult[] }
