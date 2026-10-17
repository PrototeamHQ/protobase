import { sql } from 'kysely'
import type { CheckedFilter, ResourceModel } from '@protobase/schema'
import { baseQuery } from './base-query'
import { columnRef, requireField } from './columns'
import type { Db } from './db'
import { QueryError } from './errors'
import { assertFilterRequirements } from './filter-requirements'
import { measureSql, measureValue, type Measure } from './measure'
import { toNumber } from './numbers'
import type { Scope } from './scope'
import { withStatementTimeout } from './with-statement-timeout'

const defaultLimit = 100
const maxLimit = 1000

export type GroupTotalsOptions = { statementTimeoutMs: number; filter?: CheckedFilter; measure?: Measure; limit?: number; scope?: Scope }
/** One value of the grouped field: how many rows have it and, with a measure, their sum or average. */
export type GroupTotal = { value: unknown; count: number; sum?: number | null; average?: number | null }

/**
 * Rows per value of `field` under the whole filter, largest first: by the measure when there is one, else by count.
 * Unlike facets, the filter's own terms on `field` apply too, so the groups add up to what the filter finds.
 */
export const groupTotals = async (db: Db, model: ResourceModel, field: string, options: GroupTotalsOptions): Promise<GroupTotal[]> => {
  const target = requireField(model, field, 'filterable')
  if (target.type === 'json') throw new QueryError('unsupported_field_type', `Cannot group by "${field}", which is json`)
  const limit = options.limit ?? defaultLimit
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    throw new QueryError('invalid_option', `limit must be between 1 and ${maxLimit}`)
  }
  const { measure } = options
  const amount = measure ? measureSql(model, measure) : undefined
  const column = columnRef(target)
  await assertFilterRequirements(db, options.filter, options.scope)
  return withStatementTimeout(db, options.statementTimeoutMs, async trx => {
    const rows = await baseQuery(trx, model, options.filter, options.scope)
      .select([sql`${column}`.as('value'), sql`count(*)::text`.as('n'), ...(amount ? [sql`${amount}::text`.as('m')] : [])])
      .groupBy(column)
      .orderBy(amount ? sql`${amount} desc nulls last` : sql`count(*) desc`)
      .orderBy(column, 'asc')
      .limit(limit)
      .execute()
    return rows.map(row => {
      const total = { value: row.value, count: toNumber(row.n) }
      return measure ? { ...total, [measure.kind]: measureValue((row as { m?: unknown }).m) } : total
    })
  })
}
