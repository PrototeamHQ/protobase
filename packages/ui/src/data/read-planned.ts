import type { Client, ListParams, RecordPhotos, RelatedLabels } from '@protobase/client'
import type { PlanRead, PlanResult } from '@protobase/layout'

/** What a planned list read gives a block that names its relations or shows photos: the names and photos of all its rows. */
export type PlannedPage = PlanResult & { labels?: RelatedLabels; photos?: RecordPhotos }

/** What a block inside the records of another asks its planned list read for beside its rows, as its own read would. */
export type PlannedExtras = Pick<ListParams, 'labels' | 'photos'>

/**
 * One read of a page's read plan, as an ordinary API request of its own: a list, a count of one, or a count per record
 * around it, an `:aggregate` grouped by the field it splits on, whose groups come back as records `{ value, count }`.
 * A list asked for `extras` gives its rows' labels and photos too.
 */
export const readPlanned = async (client: Client, read: PlanRead, extras: PlannedExtras = {}): Promise<PlannedPage> => {
  const filter = read.filter || undefined
  // A read no block changes asks for no ETag, so the server reads only its fields
  const etag = read.etag ? {} : { etag: false as const }
  if (read.kind === 'aggregate') {
    const result = await client.aggregate(read.resource, { groupBy: read.groupBy![0]!, filter, ...(read.pageSize !== undefined && { limit: read.pageSize }) })
    return { rows: result.groups.map(({ value, count }) => ({ value, count })) }
  }
  if (read.kind === 'count') {
    const page = await client.list(read.resource, { filter, pageSize: 1, count: 'exact', fields: read.fields, ...etag })
    return { rows: [], total: page.totalSize ?? page.totalSizeEstimate }
  }
  const page = await client.list(read.resource, { filter, orderBy: read.orderBy, pageSize: read.pageSize, fields: read.fields, limitPer: read.limitPer, ...extras, ...etag })
  return { rows: page.items, ...(page.labels && { labels: page.labels }), ...(page.photos && { photos: page.photos }) }
}
