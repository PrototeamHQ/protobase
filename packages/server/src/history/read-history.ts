import { sql } from 'kysely'
import { z } from 'zod'
import type { ResourceModel } from '@protobase/schema'
import { encodeKey } from '@protobase/schema/internal'
import { anonymousUserId } from '../anonymous'
import { quoteIdent } from '../changes/capture-sql'
import type { Deps } from '../deps'
import { parseParams } from '../params'
import { notFound } from '../problem'
import { fetchReadable } from '../fetch-readable'
import type { Entry } from '../registry'
import { requestAccess, requireOperation } from '../request-access'
import { tenantScope } from '../tenant'
import { readTransaction } from '../transactions'
import type { Row, Session } from '../types'

/** One change of a record as its reader may see it. */
export type HistoryItem = {
  id: string
  at: string
  operation: 'create' | 'update' | 'delete' | 'undelete'
  /** The fields an update changed that the reader may read, sensitive ones included. */
  changed: string[]
  /** The fields before and after that the reader may read, without sensitive and file fields. */
  before?: Row
  after?: Row
  /** The API's caller, with their name when the project's auth knows it; `null` for a write from elsewhere. */
  actor: { id: string; name?: string } | null
  /** The database role that wrote; `null` when unknown. */
  database_role: string | null
}

type HistoryRow = { id: string; at: string; operation: HistoryItem['operation']; changed: string[]; before: Row | null; after: Row | null; actor_id: string | null; database_role: string | null }

const params = z.object({
  page_size: z.coerce.number().int().min(0).max(100).optional(),
  page_token: z.string().regex(/^\d+$/, 'Use the next_page_token of the previous page').optional(),
})

const defaultPageSize = 20

// Who a caller without a token is in a history, such as someone who sent a public form.
const visitorName = 'Visitor'

const picked = (row: Row | null, names: ReadonlySet<string>) => (row ? Object.fromEntries(Object.entries(row).filter(([name]) => names.has(name))) : undefined)

// What the reader may see of a change; an update of only fields they may not read is none of theirs.
const shown = (row: HistoryRow, readable: ResourceModel, names: Record<string, string>): HistoryItem[] => {
  const values = new Set(Object.values(readable.fields).filter((field) => !field.sensitive && !field.file).map((field) => field.name))
  const changed = row.changed.filter((name) => Object.hasOwn(readable.fields, name))
  if (row.operation === 'update' && changed.length === 0) return []
  const before = picked(row.before, values)
  const after = picked(row.after, values)
  const name = row.actor_id === null ? undefined : row.actor_id === anonymousUserId ? visitorName : names[row.actor_id]
  return [{
    id: row.id,
    at: row.at,
    operation: row.operation,
    changed,
    ...(before && { before }),
    ...(after && { after }),
    actor: row.actor_id === null ? null : { id: row.actor_id, ...(name !== undefined && { name }) },
    database_role: row.database_role,
  }]
}

/**
 * A page of a record's history, newest first, for a caller who may read the record: the same tenant, row filter and
 * record-level rule as a get, a soft-deleted record included. Each change carries only the fields the caller may read.
 */
export const readHistory = async (deps: Deps, entry: Entry, session: Session, key: (string | number)[], query: Record<string, string>) => {
  const { schema, actorNames } = deps.history ?? {}
  if (!schema || !entry.model.history) throw notFound(`${entry.name} keeps no history`)
  const { page_size, page_token } = parseParams(params, query)
  const size = page_size || defaultPageSize
  const access = await requestAccess(deps, entry, session)
  requireOperation(access, 'read')
  const keyFields = access.full.primaryKey.map((part) => access.full.fields[part]!)
  const tenant = tenantScope(entry, session)?.tenantValue
  const table = sql.raw(`${quoteIdent(schema)}."history"`)

  const rows = await readTransaction(deps.db, deps.statementTimeoutMs, async (trx) => {
    if (!(await fetchReadable(trx, access, key, entry.model.softDelete ? 'show' : 'hide', { fields: keyFields }))) return undefined
    const { rows } = await sql<HistoryRow>`select "id"::text as id, to_char("at" at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as at, "operation", "changed", "before", "after", "actor_id", "database_role"
      from ${table} where "resource" = ${entry.name} and "record_key" = ${encodeKey(key)}
        ${tenant === undefined ? sql`` : sql`and "tenant_id" = ${String(tenant)}`}
        ${page_token === undefined ? sql`` : sql`and "id" < ${page_token}::bigint`}
      order by "id" desc limit ${size + 1}`.execute(trx)
    return rows
  })
  if (!rows) throw notFound(`No ${entry.name} with this key`)
  const page = rows.slice(0, size)
  const ids = [...new Set(page.flatMap((row) => (row.actor_id === null || row.actor_id === anonymousUserId ? [] : [row.actor_id])))]
  const names = ids.length > 0 && actorNames ? await actorNames(ids) : {}
  return {
    items: page.flatMap((row) => shown(row, access.readable, names)),
    next_page_token: rows.length > size ? page.at(-1)!.id : '',
  }
}
