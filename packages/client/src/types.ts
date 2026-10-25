import type { PageModel } from '@protobase/layout'
import type { BottomBarModel, InferRecord, ResourceModel, SignInViewModel, UserMenuModel, ViewModel } from '@protobase/schema'
import type { FilterInput } from './query-string'

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

/** A public form as `/-/forms/<name>` draws it: its fields as `/meta` would give them, with their hints, and no more. */
export type PublicForm = {
  name: string
  /** The page's heading, when the form gives one; else the view's singular name. */
  title?: string
  /** The fields a visitor fills in, in order. */
  fields: string[]
  /** What the page shows once the form is sent. */
  thanks: string
  /** The resource restricted to the form's fields (and its key). */
  resource: ResourceModel
  /** The view's names and the form fields' hints. */
  view: ViewModel
}

/** A public form's bot check as the server hands it out: an ALTCHA proof-of-work challenge, solved with `altcha-lib`. */
export type FormChallenge = {
  parameters: {
    algorithm: string
    nonce: string
    salt: string
    cost: number
    keyLength: number
    keyPrefix: string
    keySignature?: string
    expiresAt?: number
    data?: Record<string, string | number | boolean | null>
  }
  signature?: string
}

/** A solved bot check, sent with the form: the challenge as it came, and the solver's answer. */
export type FormProof = { challenge: FormChallenge; solution: { counter: number; derivedKey: string } }

/** Someone a comment names: its author or a person it mentions, with their name when the server knows it. */
export type CommentPerson = { id: string; name?: string }

/** One comment on a record, as `comments` reads it. */
export type RecordComment = {
  id: string
  /** When it was written, ISO 8601. */
  createdAt: string
  /** Plain text, as written. */
  body: string
  author: CommentPerson
  /** The users it mentions, each once. */
  mentions: CommentPerson[]
}

/** A page of a record's comments, newest first. */
export type CommentPage = {
  items: RecordComment[]
  /** `""` on the last page. */
  nextPageToken: string
}

/** Someone a comment on a record may mention: a user who may read the record. */
export type MentionableUser = { id: string; name: string }

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
  range?: '1h' | '24h' | '7d' | '30d' | '90d' | '1y' | 'all'
  from?: string
  to?: string
  granularity?: 'minute' | '5_minutes' | '15_minutes' | 'hour' | 'day' | 'week' | 'month'
  timeZone?: string
}

export type AggregateParams = {
  /** A filterable field: its values make the groups, or for a date or timestamp field its buckets. */
  groupBy: string
  filter?: FilterInput
  /** A numeric field to add up per group. */
  sum?: string
  /** A numeric field to average per group, instead of `sum`. */
  average?: string
  /** A numeric field whose largest value per group it reads, instead of `sum`. */
  maximum?: string
  /** Value groups only: the most to return, default 100. */
  limit?: number
  /** Value groups only: for a relation, the field of the related record that names each group. */
  label?: string
  /** Date groups only. */
  granularity?: 'minute' | '5_minutes' | '15_minutes' | 'hour' | 'day' | 'week' | 'month' | 'year'
  range?: '1h' | '24h' | '7d' | '30d' | '90d' | '1y' | 'all'
  from?: string
  to?: string
  timeZone?: string
  /** Date groups only: a filterable field of values that splits each bucket into parts, the largest `splitLimit` values. */
  splitBy?: string
  /** Date groups only, with `splitBy`: the most values to keep, default 8, at most 100. */
  splitLimit?: number
  /** Date groups only, with `splitBy`: for a relation, the field of the related record that names each value. */
  splitLabel?: string
}

/** One group: its value (a date group's bucket in local ISO time), how many records it holds and its sum, average or maximum. */
export type AggregateGroup = {
  value: string | number | boolean | null
  label?: string
  count: number
  sum?: number | null
  average?: number | null
  maximum?: number | null
  /** With `splitBy`: the kept split values that have records in this date group, largest first. */
  splits?: AggregateSplitTotal[]
}

/** What one split value holds of a date group. */
export type AggregateSplitTotal = { value: AggregateGroup['value']; count: number; sum?: number | null; average?: number | null; maximum?: number | null }

export type Aggregate = {
  groupBy: string
  granularity?: string
  timeZone?: string
  groups: AggregateGroup[]
  /** With `splitBy`: the field and its kept values, largest over the range first. */
  splitBy?: string
  splits?: Array<{ value: AggregateGroup['value']; label?: string }>
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
 * `appName`: the app's name, which ends the admin app's tab titles.
 * `appIcon`: the path of the app's own icon, its favicon, when the project has one; the sidebar's logo draws it.
 * `signIn`: for a visitor who is not signed in, the resources they could use once signed in, with what to tell them.
 * `bottomBar`: the tabs on phones, of the bottom bar that names the caller's active role.
 * `maps`: the map style the admin app draws maps with, and the layers of raster tiles its maps may switch to.
 * `files`: the hosts besides the page's own whose images the admin app draws with the page's referrer.
 * `plugins`: the plugins the admin app loads for the caller, each by its plugin.json.
 * `sources`: the other APIs whose resources the admin app draws for the caller.
 */
export type Meta = { appName: string; protobaseVersion?: string; appIcon?: string; resources: ResourceModel[]; views: ViewModel[]; pages?: PageModel[]; permissions?: Record<string, ResourcePermissions>; userMenu?: UserMenuModel; signIn?: SignInViewModel[]; bottomBar?: Omit<BottomBarModel, 'roles'>; assistant?: { url: string }; runtime?: { url: string }; errorReporting?: { dsn: string; environment?: string }; maps?: { style: string; layers?: MapLayerModel[] }; notifications?: { bell?: true; webPushKey?: string }; locale?: 'en' | 'nl'; files?: { trustedHosts: string[] }; plugins?: PluginRef[]; sources?: SourceRef[] }

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
  | { op: 'reorder'; resource: ResourceRef; field: string; keys: Key[]; start?: number; etags?: Record<string, string> }

/** One entry per operation, in order. A `reorder` lists every key in its final order with its new ETag. */
export type BatchOpResult =
  | { op: 'create'; resource: string; ref?: string; record: Record<string, unknown>; etag: string }
  | { op: 'update'; resource: string; record: Record<string, unknown>; etag: string }
  | { op: 'delete'; resource: string; deleted: true }
  | { op: 'reorder'; resource: string; records: Array<{ record: Record<string, unknown>; etag: string }> }

export type BatchResult = { results: BatchOpResult[] }
