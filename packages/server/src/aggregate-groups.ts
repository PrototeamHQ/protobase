import { z } from 'zod'
import { groupTotals, series, type Measure } from '@protobase/query'
import type { ResourceModel } from '@protobase/schema'
import { scoped, seriesRange } from './aggregate-service'
import type { Deps } from './deps'
import { badRequest } from './problem'
import { parseParams } from './params'
import { labelRequests, relatedLabels } from './related-labels'
import type { Entry } from './registry'
import { readTransaction } from './transactions'
import type { Session } from './types'

const name = z.string().min(1)

const aggregateParams = z.object({
  group_by: name,
  filter: z.string().optional(),
  sum: name.optional(),
  average: name.optional(),
  limit: z.coerce.number().int().optional(),
  label: name.optional(),
  range: z.enum(['7d', '30d', '90d', '1y', 'all']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  granularity: z.enum(['hour', 'day', 'week', 'month', 'year']).optional(),
  time_zone: z.string().optional(),
})

type AggregateParams = z.output<typeof aggregateParams>

const invalid = (parameter: string, message: string) => badRequest('invalid-parameter', `Invalid parameter ${parameter}: ${message}`, { errors: [{ parameter, message }] })

const measureOf = (params: AggregateParams): Measure | undefined => {
  if (params.sum !== undefined && params.average !== undefined) throw invalid('average', 'Give sum or average, not both')
  if (params.sum !== undefined) return { kind: 'sum', field: params.sum }
  if (params.average !== undefined) return { kind: 'average', field: params.average }
  return undefined
}

// The options that only bucket a date apply only to a date, and the ones that only name or cut values only to values.
const optionErrors = (params: AggregateParams, dated: boolean) => {
  const given = (names: Array<keyof AggregateParams>) => names.filter((option) => params[option] !== undefined)
  if (dated) return given(['limit', 'label']).map((option) => invalid(option, `Not for a date or timestamp group_by`))
  return given(['range', 'from', 'to', 'granularity', 'time_zone']).map((option) => invalid(option, 'Only for a date or timestamp group_by'))
}

const isDated = (model: ResourceModel, field: string) => {
  const type = model.fields[field]?.type
  return type === 'date' || type === 'timestamp'
}

/**
 * Records per value of a field, or per hour, day, week, month or year of a date field with the empty ones included,
 * each with how many there are and, with `sum` or `average`, that of a numeric field. Read as a list is: the caller's
 * filter on the model as they see it, inside their tenant and row filter; the scan guard judges the grouped field.
 */
export const aggregate = async (deps: Deps, entry: Entry, session: Session, input: unknown) => {
  const params = parseParams(aggregateParams, input)
  const { access, model, filter, scope } = await scoped(deps, entry, session, params.filter)
  // A hidden field is refused exactly like an unknown one
  if (!Object.hasOwn(model.fields, params.group_by)) throw invalid('group_by', `Unknown field "${params.group_by}"`)
  const measure = measureOf(params)
  const dated = isDated(model, params.group_by)
  const [problem] = optionErrors(params, dated)
  if (problem) throw problem
  const warning = await deps.guard(entry, { ...(filter && { filter }), groupBy: params.group_by }, { model, scope })

  if (dated) {
    const granularity = params.granularity ?? 'day'
    const timeZone = params.time_zone ?? 'UTC'
    const range = await seriesRange(deps, access, params.group_by, params, scope)
    const points = range
      ? await readTransaction(deps.db, deps.statementTimeoutMs, (trx) =>
          series(trx, model, params.group_by, { range, granularity, timeZone, ...(filter && { filter }), ...(measure && { measure }), scope }))
      : []
    const groups = points.map(({ bucket, ...totals }) => ({ value: bucket, ...totals }))
    return { body: { group_by: params.group_by, granularity, time_zone: timeZone, groups }, warning }
  }

  const labels = params.label === undefined ? [] : await labelRequests(deps, session, model, [params.group_by], `${params.group_by}.${params.label}`)
  const body = await readTransaction(deps.db, deps.statementTimeoutMs, async (trx) => {
    const totals = await groupTotals(trx, model, params.group_by, {
      statementTimeoutMs: deps.statementTimeoutMs,
      ...(filter && { filter }),
      ...(measure && { measure }),
      ...(params.limit !== undefined && { limit: params.limit }),
      scope,
    })
    const names = (await relatedLabels(trx, labels, totals.map((group) => ({ [params.group_by]: group.value }))))[params.group_by] ?? {}
    const groups = totals.map((group) => {
      const label = group.value === null ? undefined : names[String(group.value)]
      return label === undefined ? group : { ...group, label }
    })
    return { group_by: params.group_by, groups }
  })
  return { body, warning }
}
