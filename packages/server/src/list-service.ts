import { estimateCount, exactCount, listQuery, seekToPosition } from '@protobase/query'
import { checkedFilter, checkedSort } from './filter-input'
import type { Deps } from './deps'
import { deletedRows, listParams, pageSizeOf, parseParams, seekParams, selectedFields } from './params'
import { requestAccess, requireOperation, readScope } from './request-access'
import type { Entry } from './registry'
import { etagOf } from './etag'
import { rowPermissions } from './row-permissions'
import { etagAlias } from './sql-parts'
import { exposeRow, pickFields } from './rows'
import { readTransaction } from './transactions'
import type { Session } from './types'

/**
 * AIP-132 list, the `:search` variant and (with `jump`) `:seek`: both take the same parameters, from the query string or a JSON body.
 * Everything the caller names (filter, order_by, fields, search) is checked against the model as this caller sees it,
 * so a hidden field is refused exactly like an unknown one; the access row filter is applied by the query layer.
 */
export const listRecords = async (deps: Deps, entry: Entry, session: Session, input: unknown, maxFilterLength?: number, jump = false) => {
  const params = jump ? parseParams(seekParams, input) : parseParams(listParams, input)
  const access = await requestAccess(deps, entry, session)
  requireOperation(access, 'list')
  const showDeleted = deletedRows(access.full, params.show_deleted) === 'show'
  const full = showDeleted ? { ...access.full, softDelete: undefined } : access.full
  const model = showDeleted ? { ...access.model, softDelete: undefined } : access.model
  const filter = checkedFilter(model, params.filter, maxFilterLength)
  const sort = checkedSort(model, params.order_by)
  const columns = selectedFields(model, params.fields)
  const limit = pageSizeOf(params.page_size)
  const scope = readScope(access, full)

  // A version ETag reads a column the caller may not see; the model handed to the query gets it, the column list does not.
  const etagField = entry.etag && !model.fields[entry.etag.field.name] ? full.fields[entry.etag.field.name] : undefined
  const queryModel = etagField ? { ...model, fields: { ...model.fields, [etagField.name]: etagField } } : model
  // Without a version column the ETag is a hash of the readable fields, so every readable field is read
  const read = entry.etag && columns ? columns : Object.keys(model.fields)

  const shape = { ...(filter && { filter }), ...(sort && { sort }), limit }
  const warning = await deps.guard(entry, shape, { model: queryModel, scope })
  // `:seek` resolves a row position to a page on the server, so no anchor value ever reaches the caller
  const position = jump ? (params as { position: number }).position : undefined
  const result = await readTransaction(deps.db, deps.statementTimeoutMs, async (trx) => {
    const extraColumns = entry.etag ? [{ field: entry.etag.field.name, as: 'text' as const, alias: etagAlias }] : []
    const page = position === undefined
      ? await listQuery(trx, queryModel, { ...shape, columns: read, ...(params.page_token && { cursor: params.page_token }) }, scope, { extraColumns })
      : await seekToPosition(trx, queryModel, { position, orderBy: sort ?? [[entry.model.primaryKey[0]!, 'asc']], ...(filter && { filter }), columns: read, limit }, scope, { extraColumns })
    const rows = page.rows.map((row) => exposeRow(model, row))
    return {
      page,
      rows,
      etags: await Promise.all(rows.map((row, i) => etagOf(entry, page.rows[i]!, row))),
      permissions: deps.rowPermissions(entry.name) ? await rowPermissions(trx, access, rows) : undefined,
      estimate: await estimateCount(trx, queryModel, filter, scope),
      ...(params.count === 'exact' && { total: await exactCount(trx, queryModel, filter, scope) }),
    }
  })

  return {
    warning,
    body: {
      items: result.rows.map((row, i) => ({
        ...pickFields(row, columns),
        etag: result.etags[i],
        ...(result.permissions && { permissions: result.permissions[i] }),
      })),
      next_page_token: result.page.nextCursor ?? '',
      ...(position !== undefined && { prev_page_token: result.page.prevCursor ?? '' }),
      total_size_estimate: result.estimate,
      ...(result.total !== undefined && { total_size: result.total }),
    },
  }
}

