import { sql } from 'kysely'
import { z } from 'zod'
import { encodeKey } from '@protobase/schema/internal'
import type { Deps } from '../deps'
import { parseParams } from '../params'
import { notFound } from '../problem'
import type { Entry } from '../registry'
import { tenantScope } from '../tenant'
import { readTransaction } from '../transactions'
import type { Session } from '../types'
import { commentAccess, readableRecord } from './comment-access'
import { commentColumns, commentItem, namedUsers, type CommentRow } from './comment-item'
import { commentsTable } from './comments-sql'

const params = z.object({
  page_size: z.coerce.number().int().min(0).max(100).optional(),
  page_token: z.string().regex(/^\d+$/, 'Use the next_page_token of the previous page').optional(),
})

const defaultPageSize = 20

/**
 * A page of a record's comments, newest first, for a caller who may read the record: the same tenant, row filter and
 * record-level rule as a get, a soft-deleted record included.
 */
export const readComments = async (deps: Deps, entry: Entry, session: Session, key: (string | number)[], query: Record<string, string>) => {
  const access = await commentAccess(deps, entry, session)
  const { page_size, page_token } = parseParams(params, query)
  const size = page_size || defaultPageSize
  const tenant = tenantScope(entry, session)?.tenantValue

  const rows = await readTransaction(deps.db, deps.statementTimeoutMs, async (trx) => {
    if (!(await readableRecord(trx, access, key, entry.model.softDelete ? 'show' : 'hide'))) return undefined
    const { rows } = await sql<CommentRow>`select ${sql.raw(commentColumns)}
      from ${sql.raw(commentsTable)} where "resource" = ${entry.name} and "record_key" = ${encodeKey(key)}
        ${tenant === undefined ? sql`` : sql`and "tenant_id" = ${String(tenant)}`}
        ${page_token === undefined ? sql`` : sql`and "id" < ${page_token}::bigint`}
      order by "id" desc limit ${size + 1}`.execute(trx)
    return rows
  })
  if (!rows) throw notFound(`No ${entry.name} with this key`)
  const page = rows.slice(0, size)
  const ids = namedUsers(page)
  const names = ids.length > 0 && deps.comments?.users ? await deps.comments.users.names(ids) : {}
  return { items: page.map((row) => commentItem(row, names)), next_page_token: rows.length > size ? page.at(-1)!.id : '' }
}
