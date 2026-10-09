import { sql } from 'kysely'
import type { CheckedFilter, ResourceModel } from '@protobase/schema'
import { baseQuery } from './base-query'
import { columnRef, requireField } from './columns'
import type { Db } from './db'
import { QueryError } from './errors'
import { assertFilterRequirements } from './filter-requirements'
import { toNumber } from './numbers'
import { withoutField } from './prune-filter'
import type { Scope } from './scope'
import { withStatementTimeout } from './with-statement-timeout'

const defaultLimit = 100
const maxLimit = 1000

export type FacetOptions = { statementTimeoutMs: number; limit?: number; scope?: Scope }
export type FacetCount = { value: unknown; count: number }

/** Counts per value of `field`, with every filter applied except the ones on `field` itself. */
export const facetCounts = async (db: Db, model: ResourceModel, field: string, filter: CheckedFilter | undefined, options: FacetOptions): Promise<FacetCount[]> => {
  const column = columnRef(requireField(model, field, 'filterable'))
  const limit = options.limit ?? defaultLimit
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    throw new QueryError('invalid_option', `limit must be between 1 and ${maxLimit}`)
  }
  const others = withoutField(filter, field)
  await assertFilterRequirements(db, others, options.scope)
  return withStatementTimeout(db, options.statementTimeoutMs, async trx => {
    const rows = await baseQuery(trx, model, others, options.scope)
      .select([sql`${column}`.as('value'), sql`count(*)::text`.as('n')])
      .groupBy(column)
      .orderBy(sql`count(*)`, 'desc')
      .orderBy(column, 'asc')
      .limit(limit)
      .execute()
    return rows.map(row => ({ value: row.value, count: toNumber(row.n) }))
  })
}
