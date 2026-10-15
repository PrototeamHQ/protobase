import { z } from 'zod'
import { checkMapPosition, countUpTo, mapBuckets, maxMapZoom } from '@protobase/query'
import type { Deps } from './deps'
import { checkedFilter } from './filter-input'
import { photosRequest } from './list-photos'
import { listRecords } from './list-service'
import { parseParams, selectedFields } from './params'
import { labelRequests } from './related-labels'
import type { Entry } from './registry'
import { readScope, requestAccess, requireOperation } from './request-access'
import { readTransaction } from './transactions'
import type { Session } from './types'

/** Up to this many matching records, the map gets the records themselves rather than buckets. */
export const mapRecordsLimit = 200
/** From this zoom on, the map gets the records, at most `mapRecordsLimit` of them, however many match. */
export const mapRecordsZoom = 16

const mapParams = z.object({
  latitude: z.string().min(1),
  longitude: z.string().min(1),
  zoom: z.coerce.number().int().min(0).max(maxMapZoom),
  filter: z.string().optional(),
  order_by: z.string().optional(),
  fields: z.union([z.string(), z.array(z.string())]).optional(),
  labels: z.string().optional(),
  photos: z.string().optional(),
  photos_order_by: z.string().optional(),
})

/**
 * The matching records for a map at `zoom`, the bounding box being part of the filter: the records themselves when
 * few match or the map is close enough, as a list returns them, else buckets of a grid sized for the zoom. Both are
 * checked and scoped like a list.
 */
export const mapRecords = async (deps: Deps, entry: Entry, session: Session, input: unknown) => {
  const params = parseParams(mapParams, input)
  const access = await requestAccess(deps, entry, session)
  requireOperation(access, 'list')
  const position = { latitude: params.latitude, longitude: params.longitude }
  checkMapPosition(access.model, position)
  const filter = checkedFilter(access.model, params.filter)
  const scope = readScope(access)
  const found = await readTransaction(deps.db, deps.statementTimeoutMs, (trx) => countUpTo(trx, access.model, mapRecordsLimit + 1, filter, scope))

  if (found <= mapRecordsLimit || params.zoom >= mapRecordsZoom) {
    const { latitude: _latitude, longitude: _longitude, zoom: _zoom, ...asked } = params
    const list = { ...asked, page_size: mapRecordsLimit, ...(found > mapRecordsLimit && { count: 'exact' }) }
    const { body, warning } = await listRecords(deps, entry, session, list)
    return { warning, body: { items: body.items, buckets: [], total_size: body.total_size ?? (found > mapRecordsLimit ? body.total_size_estimate : found), ...(body.labels && { labels: body.labels }), ...(body.photos && { photos: body.photos }) } }
  }
  // Buckets name no records, but `labels` and `photos` are checked all the same, so a wrong one fails at every zoom
  if (params.labels !== undefined) await labelRequests(deps, session, access.model, selectedFields(access.model, params.fields), params.labels)
  await photosRequest(deps, session, access.model, params.photos, params.photos_order_by)
  const result = await readTransaction(deps.db, deps.statementTimeoutMs, (trx) => mapBuckets(trx, access.model, position, params.zoom, filter, scope))
  return { warning: undefined, body: { items: [], buckets: result.buckets, total_size: result.total, ...(params.labels !== undefined && { labels: {} }), ...(params.photos !== undefined && { photos: {} }) } }
}
