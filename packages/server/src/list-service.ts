import { countUpTo, estimateCount, listPerValue, listQuery, seekToPosition } from '@protobase/query'
import type { FilterExpr } from '@protobase/schema'
import { checkedSort } from './filter-input'
import type { Deps } from './deps'
import { deletedRows, listParams, pageSizeOf, parseParams, seekParams, selectedFields } from './params'
import { limitPerOf } from './limit-per'
import { badRequest } from './problem'
import { readFilter } from './related-filter'
import { requestAccess, requireOperation } from './request-access'
import type { Entry } from './registry'
import { etagOf } from './etag'
import { presentFiles } from './files/present'
import { rowPermissions } from './row-permissions'
import { etagAlias } from './sql-parts'
import { labelRequests, relatedLabels } from './related-labels'
import { photosRequest, recordPhotos } from './list-photos'
import { exposeRow, pickFields } from './rows'
import { readTransaction, snapshotReadTransaction } from './transactions'
import type { Session } from './types'

// `count=exact` counts no further than this, so a broad filter never reads every match to count it: above it the total
// is the planner's estimate alone.
export const exactCountLimit = 10_000

/**
 * AIP-132 list, the `:search` variant and (with `jump`) `:seek`: both take the same parameters, from the query string or a JSON body.
 * Everything the caller names (filter, order_by, fields, search) is checked against the model as this caller sees it,
 * so a hidden field is refused exactly like an unknown one; the access row filter is applied by the query layer.
 * `labels` names the records the returned relations point at, each read under the related resource's own access, and
 * `photos` brings each record's first photos, read under the photos' resource's own access. `limit_per` keeps the first
 * rows per value of a field, by value and in the list's order within each, with no further page. `live` asks for a live
 * token of the read (`token`), for a live resource when the app has one to give: the read then runs in one snapshot.
 */
export const listRecords = async (deps: Deps, entry: Entry, session: Session, input: unknown, maxFilterLength?: number, jump = false, within?: FilterExpr, live = false) => {
  const params = jump ? parseParams(seekParams, input) : parseParams(listParams, input)
  const access = await requestAccess(deps, entry, session)
  requireOperation(access, 'list')
  const showDeleted = deletedRows(access.full, params.show_deleted) === 'show'
  const full = showDeleted ? { ...access.full, softDelete: undefined } : access.full
  const model = showDeleted ? { ...access.model, softDelete: undefined } : access.model
  const { filter, scope } = await readFilter(access, model, full, params.filter, maxFilterLength, within)
  const sort = checkedSort(model, params.order_by)
  const columns = selectedFields(model, params.fields)
  const labels = await labelRequests(deps, session, model, columns, params.labels)
  const photos = await photosRequest(deps, session, model, params.photos, params.photos_order_by)
  const limit = pageSizeOf(params.page_size)
  const per = limitPerOf(model, params.limit_per)
  if (per && (jump || params.page_token)) {
    const other = jump ? ':seek' : 'page_token'
    throw badRequest('invalid-parameter', `limit_per cannot be combined with ${other}: a list that keeps the first rows per value has no further page`, { errors: [{ parameter: 'limit_per', message: `Not with ${other}` }] })
  }

  // A version ETag reads a column the caller may not see; the model handed to the query gets it, the column list does not.
  const etagField = entry.etag && !model.fields[entry.etag.field.name] ? full.fields[entry.etag.field.name] : undefined
  const queryModel = etagField ? { ...model, fields: { ...model.fields, [etagField.name]: etagField } } : model
  // Without a version column the ETag is a hash of the readable fields, so every readable field is read; a file's
  // download URL names its row, photos are matched to it and row permissions are decided by it, so a selection with a
  // file field, photos or row permissions reads the key too
  const permitted = deps.rowPermissions(entry.name)
  const keyed = permitted || photos !== undefined || columns?.some((name) => model.fields[name]!.type === 'file')
  const withKey = keyed && columns ? [...new Set([...columns, ...entry.model.primaryKey.filter((name) => model.fields[name])])] : columns
  // A list across tenants reads each row's tenant too, which tells its row permissions whether it is the caller's own
  const across = model.tenantAcross && model.tenant !== undefined ? [model.tenant] : []
  // `etag=false` hashes nothing, so like a version column it needs no field beyond the selection
  const etags = params.etag !== false
  // A lookup field is no part of the hash, so only one the caller selects is read
  const hashed = Object.keys(model.fields).filter((name) => !model.fields[name]!.lookup || !columns || columns.includes(name))
  const read = (entry.etag || !etags) && withKey ? [...new Set([...withKey, ...across])] : hashed

  const shape = { ...(filter && { filter }), ...(sort && { sort }), limit }
  const warning = await deps.guard(entry, { ...shape, ...(per && { per: per.field }) }, { model: queryModel, scope })
  // `:seek` resolves a row position to a page on the server, so no anchor value ever reaches the caller
  const position = jump ? (params as { position: number }).position : undefined
  const subject = live && entry.model.live && deps.liveTokens ? await deps.liveTokens.subject(session) : undefined
  const transaction = subject ? snapshotReadTransaction : readTransaction
  const result = await transaction(deps.db, deps.statementTimeoutMs, async (trx) => {
    const extraColumns = entry.etag && etags ? [{ field: entry.etag.field.name, as: 'text' as const, alias: etagAlias }] : []
    const readPage = () => {
      if (per) return listPerValue(trx, queryModel, { ...shape, columns: read }, per, scope, { extraColumns })
      if (position === undefined) return listQuery(trx, queryModel, { ...shape, columns: read, ...(params.page_token && { cursor: params.page_token }) }, scope, { extraColumns })
      return seekToPosition(trx, queryModel, { position, orderBy: sort ?? [[entry.model.primaryKey[0]!, 'asc']], ...(filter && { filter }), columns: read, limit }, scope, { extraColumns })
    }
    const page = await readPage()
    const rows = page.rows.map((row) => exposeRow(model, row))
    return {
      page,
      rows,
      etags: etags ? await Promise.all(rows.map((row, i) => etagOf(entry, page.rows[i]!, row))) : undefined,
      permissions: permitted ? await rowPermissions(trx, access, rows) : undefined,
      estimate: await estimateCount(trx, queryModel, filter, scope),
      ...(params.count === 'exact' && { counted: await countUpTo(trx, queryModel, exactCountLimit + 1, filter, scope) }),
      ...(params.labels !== undefined && { labels: await relatedLabels(trx, labels, rows) }),
      token: subject && (await deps.liveTokens!.seal(trx, subject, { model: queryModel, scope, ...(filter && { filter }), fields: columns ?? Object.keys(model.fields) })),
    }
  })

  const shown = await presentFiles(access, result.rows)
  const included = photos && (await recordPhotos(deps, photos, model, result.rows))
  return {
    warning: warning ?? included?.warning,
    token: result.token,
    body: {
      items: shown.map((row, i) => ({
        ...pickFields(row, columns),
        ...(result.etags && { etag: result.etags[i] }),
        ...(result.permissions && { permissions: result.permissions[i] }),
      })),
      next_page_token: result.page.nextCursor ?? '',
      ...(position !== undefined && { prev_page_token: result.page.prevCursor ?? '' }),
      total_size_estimate: result.estimate,
      ...(result.counted !== undefined && result.counted <= exactCountLimit && { total_size: result.counted }),
      ...(result.labels && { labels: result.labels }),
      ...(included && { photos: included.photos }),
    },
  }
}

