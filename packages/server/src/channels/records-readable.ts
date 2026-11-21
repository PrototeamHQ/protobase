import { sql, type SqlBool } from 'kysely'
import type { CheckedFilter } from '@protobase/schema'
import type { Db } from '@protobase/query'
import type { Deps } from '../deps'
import { HttpProblem } from '../problem'
import { fetchRecords, recordKey } from '../records'
import { recordDecision, requestAccess, targetFilter, type RequestAccess } from '../request-access'
import { filterCondition, keyConditions, scopeConditions, tableId, whereClause, columnId } from '../sql-parts'
import { tenantScope } from '../tenant'
import type { Session } from '../types'

// What a read of a record answers for a caller who may not see it, as `recordReadable` takes it.
const refusedStatuses = new Set([401, 403, 404])

type Key = (string | number)[]

/**
 * Which of these keys of one resource the caller may read, by `recordKey`, as `recordReadable` decides it for one:
 * the resource's read access, the tenant, the row filter, the parents read and a record-level read rule; a soft-deleted
 * or missing record is not readable. One read of the rows, and one more for the rows a record-level rule answers with a
 * filter. Runs in the caller's transaction; any error but a refusal of the resource throws.
 */
export const readableKeys = async (deps: Deps, db: Db, session: Session, entry: RequestAccess['entry'], keys: readonly Key[]): Promise<Set<string>> => {
  if (keys.length === 0) return new Set()
  const read = async () => {
    const access = await requestAccess(deps, entry, session)
    if (!access.resolved.operations.read) return new Set<string>()
    const tenant = tenantScope(entry, session)?.tenantValue
    const recordRule = access.resolved.recordChecks.includes('read')
    const filter = targetFilter(access, 'read')
    // A record-level rule reads the whole row.
    const fields = recordRule ? undefined : [access.full.fields[access.full.primaryKey[0]!]!]
    const rows = await fetchRecords(db, entry, keys, tenant, { deleted: 'hide', ...(filter && { filter }), parents: access.parents, ...(fields && { fields }) })
    if (!recordRule) return new Set(rows.keys())
    const readable = new Set<string>()
    const filtered: Array<{ key: Key; filter: CheckedFilter }> = []
    for (const [name, { record }] of rows) {
      const decision = await recordDecision(access, 'read', record)
      if (decision === true) readable.add(name)
      else if (decision !== false) filtered.push({ key: access.full.primaryKey.map((field) => record[field] as string | number), filter: decision })
    }
    for (const name of await matchingKeys(db, access, tenant, filtered)) readable.add(name)
    return readable
  }
  return read().catch((error: unknown) => {
    if (error instanceof HttpProblem && refusedStatuses.has(error.status)) return new Set<string>()
    throw error
  })
}

// The rows of `checks` that their own filter matches, in one read, as `fetchReadable` checks a rule's filter for one.
const matchingKeys = async (db: Db, { entry, full }: RequestAccess, tenant: Parameters<typeof scopeConditions>[1], checks: Array<{ key: Key; filter: CheckedFilter }>) => {
  if (checks.length === 0) return []
  const each = checks.map(({ key, filter }) => sql<SqlBool>`(${sql.join([...keyConditions(full, key), ...filterCondition(full, filter)], sql` and `)})`)
  const conditions = [...scopeConditions(full, tenant, 'hide'), sql<SqlBool>`(${sql.join(each, sql` or `)})`]
  const columns = sql.join(full.primaryKey.map((name) => sql`${columnId(full.fields[name]!)} as ${sql.id(name)}`))
  const { rows } = await sql<Record<string, unknown>>`select ${columns} from ${tableId(full)} as t${whereClause(conditions)}`.execute(db)
  return rows.map((row) => recordKey(entry, row))
}
