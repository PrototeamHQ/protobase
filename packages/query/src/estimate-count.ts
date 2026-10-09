import { sql } from 'kysely'
import type { CheckedFilter, ResourceModel } from '@protobase/schema'
import { baseQuery } from './base-query'
import type { Db } from './db'
import { fullModelOf, type Scope } from './scope'
import { quoteIdent } from './db'
import { assertFilterRequirements } from './filter-requirements'
import { explainPlan } from './explain'
import { toNumber } from './numbers'

/** Planner estimate of the number of live rows matching the filter. */
export const planEstimate = async (db: Db, model: ResourceModel, filter?: CheckedFilter, scope?: Scope) => {
  await assertFilterRequirements(db, filter, scope)
  const compiled = baseQuery(db, model, filter, scope).select(sql.lit(1).as('one')).compile()
  const plan = await explainPlan(db, compiled)
  return Math.round(plan['Plan Rows'])
}

const tableReltuples = async (db: Db, model: ResourceModel) => {
  const { schema, name } = model.table
  const qualified = schema ? `${quoteIdent(schema)}.${quoteIdent(name)}` : quoteIdent(name)
  const result = await sql<{ reltuples: unknown }>`
    select reltuples::float8 as reltuples from pg_class where oid = to_regclass(${qualified})
  `.execute(db)
  return toNumber(result.rows[0]?.reltuples ?? -1)
}

/**
 * Without a filter (and no soft delete, tenant or row filter to narrow by) this is pg_class.reltuples, which is O(1).
 * Otherwise, or before the table was ever analyzed, it is the planner's row estimate.
 */
export const estimateCount = async (db: Db, model: ResourceModel, filter?: CheckedFilter, scope?: Scope) => {
  const full = fullModelOf(model, scope)
  if (filter || scope?.rowFilter || full.softDelete || full.tenant || model.softDelete || model.tenant) return planEstimate(db, model, filter, scope)
  const reltuples = await tableReltuples(db, model)
  return reltuples >= 0 ? Math.round(reltuples) : planEstimate(db, model)
}
