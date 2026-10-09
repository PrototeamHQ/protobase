import type { PageModel } from '@protobase/layout'
import type { InferRecord, ResourceModel, UserMenuModel, ViewModel } from '@protobase/schema'

/** A resource by name, or the builder from `resource(...)`, which carries its record type. */
export type ResourceRef = string | { readonly $fields: unknown; toModel(): ResourceModel }

/** Records as they travel: dates are ISO text, 64-bit integers and decimals are strings. */
export type RecordOf<R extends ResourceRef> = R extends { readonly $fields: unknown }
  ? InferRecord<R>
  : Record<string, unknown>

export type ListPage<T> = {
  items: T[]
  /** `""` on the last page. */
  nextPageToken: string
  /** Only from `seek`; `""` on the first page. */
  prevPageToken?: string
  totalSizeEstimate: number
  /** Only with `count: 'exact'`. */
  totalSize?: number
  /** `X-Protobase-Warning`, for example a scan-guard notice. */
  warning?: string
}

export type Facet = { value: string | number | boolean | null; count: number }

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

/** What the signed-in user may do with a resource; `conditional` operations are decided per record by the server. */
export type ResourcePermissions = { read?: boolean; create: boolean; update: boolean; delete: boolean; conditional: Array<'create' | 'update' | 'delete'> }

export type Meta = { resources: ResourceModel[]; views: ViewModel[]; pages?: PageModel[]; permissions?: Record<string, ResourcePermissions>; userMenu?: UserMenuModel }

export type MetaResult = { status: 'modified'; meta: Meta; etag: string } | { status: 'unchanged' }

/** What the caller may do with one record; `fields` maps each readable field to `edit` or `read`, hidden ones are absent. */
export type RecordPermissions = { update: boolean; delete: boolean; fields?: Record<string, 'edit' | 'read'> }

export type Stored<T> = { record: T; etag: string; permissions?: RecordPermissions }

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
