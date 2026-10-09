import { sql } from 'kysely'
import { z } from 'zod'
import { facetCounts, histogram, series } from '@protobase/query'
import type { Granularity } from '@protobase/query'
import { checkedFilter } from './filter-input'
import type { Deps } from './deps'
import type { ResourceModel } from '@protobase/schema'
import { badRequest } from './problem'
import { parseParams } from './params'
import type { Entry } from './registry'
import { readScope, requestAccess, requireOperation, type RequestAccess } from './request-access'
import { columnId, filterCondition, scopeConditions, tableId, whereClause } from './sql-parts'
import { readTransaction } from './transactions'
import type { Session } from './types'

const field = z.string().min(1)
const filter = z.string().optional()

const facetParams = z.object({ field, filter, limit: z.coerce.number().int().optional() })
const seriesParams = z.object({
  field,
  filter,
  range: z.enum(['7d', '30d', '90d', '1y', 'all']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  granularity: z.enum(['hour', 'day', 'week', 'month']).default('day'),
  time_zone: z.string().optional(),
})
const histogramParams = z.object({ field, filter, buckets: z.coerce.number().int().default(20) })

const rangeDays = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 }

// Aggregates are reads: the caller's filter is checked against the model as the caller sees it (a hidden field is an
// unknown field), and the tenant and the access row filter are applied by the query layer's scope.
const scoped = async (deps: Deps, entry: Entry, session: Session, source?: string) => {
  const access = await requestAccess(deps, entry, session)
  requireOperation(access, 'list')
  return { access, model: access.model, filter: checkedFilter(access.model, source), scope: readScope(access) }
}

/** Counts per value of a field, ignoring the filter's own terms on that field (AIP-160 filters, UI facet panels). */
export const facets = async (deps: Deps, entry: Entry, session: Session, input: unknown) => {
  const params = parseParams(facetParams, input)
  const { model, filter: checked, scope } = await scoped(deps, entry, session, params.filter)
  const counts = await readTransaction(deps.db, deps.statementTimeoutMs, (trx) =>
    facetCounts(trx, model, params.field, checked, {
      statementTimeoutMs: deps.statementTimeoutMs,
      ...(params.limit !== undefined && { limit: params.limit }),
      scope,
    }))
  return { field: params.field, facets: counts }
}

const earliest = async (deps: Deps, access: RequestAccess, fieldName: string, scope: ReturnType<typeof readScope>) => {
  const target = access.model.fields[fieldName]!
  const conditions = [...scopeConditions(access.full, scope.tenantValue), ...filterCondition(access.full, scope.rowFilter)]
  const result = await readTransaction(deps.db, deps.statementTimeoutMs, (trx) =>
    sql<{ lowest: string | null }>`select min(${columnId(target)})::text as lowest from ${tableId(access.full)} as t${whereClause(conditions)}`.execute(trx))
  return result.rows[0]?.lowest ?? undefined
}

const bound = (model: ResourceModel, fieldName: string, value: string) =>
  model.fields[fieldName]?.type === 'date' ? value.slice(0, 10) : value

const seriesRange = async (deps: Deps, access: RequestAccess, params: z.output<typeof seriesParams>, scope: ReturnType<typeof readScope>) => {
  const to = params.to ?? new Date().toISOString()
  const { model } = access
  if (params.from) return { from: bound(model, params.field, params.from), to: bound(model, params.field, to) }
  const range = params.range ?? '30d'
  if (range !== 'all') {
    const from = new Date(Date.now() - rangeDays[range] * 86_400_000).toISOString()
    return { from: bound(model, params.field, from), to: bound(model, params.field, to) }
  }
  const lowest = await earliest(deps, access, params.field, scope)
  return lowest ? { from: bound(model, params.field, lowest), to: bound(model, params.field, to) } : undefined
}

/** Row counts per calendar bucket of a date or timestamp field, empty buckets included. */
export const timeSeries = async (deps: Deps, entry: Entry, session: Session, input: unknown) => {
  const params = parseParams(seriesParams, input)
  const { access, model, filter: checked, scope } = await scoped(deps, entry, session, params.filter)
  // A hidden field is refused exactly like an unknown one
  if (!model.fields[params.field]) throw badRequest('invalid-parameter', `Unknown field "${params.field}"`, { errors: [{ parameter: 'field', message: 'Unknown field' }] })
  const range = await seriesRange(deps, access, params, scope)
  const timeZone = params.time_zone ?? 'UTC'
  const points = range
    ? await readTransaction(deps.db, deps.statementTimeoutMs, (trx) =>
        series(trx, model, params.field, { range, granularity: params.granularity as Granularity, timeZone, ...(checked && { filter: checked }), scope }))
    : []
  return { field: params.field, granularity: params.granularity, time_zone: timeZone, points }
}

/** Equal-width buckets between the filtered minimum and maximum of a numeric field. */
export const numericHistogram = async (deps: Deps, entry: Entry, session: Session, input: unknown) => {
  const params = parseParams(histogramParams, input)
  const { model, filter: checked, scope } = await scoped(deps, entry, session, params.filter)
  const result = await readTransaction(deps.db, deps.statementTimeoutMs, (trx) =>
    histogram(trx, model, params.field, checked, params.buckets, scope))
  return { field: params.field, ...result }
}
