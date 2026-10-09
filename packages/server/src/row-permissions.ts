import { sql, type SqlBool } from 'kysely'

import type { Db } from '@protobase/query'
import { compileFilter } from '@protobase/query'
import { fetchRecord } from './records'
import { andFilters, recordDecision, type RequestAccess } from './request-access'
import { aliasedColumn, columnId, scopeConditions, tableId, whereClause } from './sql-parts'
import { tenantScope } from './tenant'
import type { Row } from './types'

export type RowPermissions = { update: boolean; delete: boolean }

const keyOf = (access: RequestAccess, row: Row) => JSON.stringify(access.full.primaryKey.map((name) => String(row[name])))

// Keys among `rows` that satisfy a row filter, decided by the database with the same semantics as reads.
const matching = async (trx: Db, access: RequestAccess, rows: Row[], filter: NonNullable<ReturnType<typeof andFilters>>) => {
  const { full } = access
  const keyFields = full.primaryKey.map((name) => full.fields[name]!)
  const tuples = rows.map((row) => sql`(${sql.join(keyFields.map((field) => row[field.name] as string | number))})`)
  const tenant = tenantScope(access.entry, access.session)?.tenantValue
  const conditions = [...scopeConditions(full, tenant), compileFilter(full, filter), sql<SqlBool>`(${sql.join(keyFields.map(columnId))}) in (${sql.join(tuples)})`]
  const found = await sql<Row>`select ${sql.join(keyFields.map(aliasedColumn))} from ${tableId(full)} as t${whereClause(conditions)}`.execute(trx)
  return new Set(found.rows.map((row) => keyOf(access, row)))
}

/**
 * What the caller may do with each of these (exposed) rows: the operation must be allowed, the row must match the
 * operation's row filter (checked in the database), and a record-level rule must pass for the stored record. This only
 * informs the UI; every write is checked again by the write pipeline.
 */
export const rowPermissions = async (trx: Db, access: RequestAccess, rows: Row[]): Promise<RowPermissions[]> => {
  const { resolved, entry, session } = access
  const result = rows.map((): RowPermissions => ({ update: true, delete: true }))
  if (rows.length === 0) return result
  for (const operation of ['update', 'delete'] as const) {
    if (!resolved.operations[operation]) {
      result.forEach((permissions) => { permissions[operation] = false })
      continue
    }
    const filter = resolved.rowFilter[operation]
    if (filter) {
      const allowed = await matching(trx, access, rows, filter)
      rows.forEach((row, i) => { if (!allowed.has(keyOf(access, row))) result[i]![operation] = false })
    }
    if (!resolved.recordChecks.includes(operation)) continue
    const tenant = tenantScope(entry, session)?.tenantValue
    for (const [i, row] of rows.entries()) {
      if (!result[i]![operation]) continue
      const key = access.full.primaryKey.map((name) => row[name] as string | number)
      const stored = await fetchRecord(trx, entry, key, tenant)
      if (!stored) { result[i]![operation] = false; continue }
      const decision = await recordDecision(access, operation, stored.record)
      if (decision === false) { result[i]![operation] = false; continue }
      if (decision !== true) result[i]![operation] = (await matching(trx, access, [row], decision)).size > 0
    }
  }
  return result
}

