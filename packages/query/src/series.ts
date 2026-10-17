import { sql, type SqlBool } from 'kysely'
import type { CheckedFilter, ResourceModel } from '@protobase/schema'
import { baseQuery } from './base-query'
import { columnRef, requireField } from './columns'
import type { Db } from './db'
import { QueryError } from './errors'
import { assertFilterRequirements } from './filter-requirements'
import { toNumber } from './numbers'
import { measureSql, measureValue, type Measure } from './measure'
import { rangeBound } from './range-bound'
import type { Scope } from './scope'

const maxBuckets = 10_000
const approxMs = { hour: 3_600_000, day: 86_400_000, week: 604_800_000, month: 2_629_800_000, year: 31_557_600_000 }

export type Granularity = keyof typeof approxMs
export type SeriesOptions = {
  range: { from: string | Date; to: string | Date }
  granularity: Granularity
  timeZone?: string
  filter?: CheckedFilter
  scope?: Scope
  /** Adds up a numeric field per bucket besides the count. */
  measure?: Measure
}
export type SeriesPoint = { bucket: string; count: number; sum?: number | null; average?: number | null }

const checkTimeZone = (timeZone: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone })
  } catch (error) {
    if (error instanceof RangeError) throw new QueryError('invalid_option', `Unknown time zone "${timeZone}"`)
    throw error
  }
}

/**
 * Row counts per calendar bucket, in `timeZone`, with empty buckets present. `to` is exclusive.
 * Buckets are returned as local ISO strings without offset. `date` fields ignore the time zone;
 * `timestamp` columns without a zone are read in the session time zone. With a measure, a bucket without a row to add
 * up has `null` for it.
 */
export const series = async (db: Db, model: ResourceModel, field: string, options: SeriesOptions): Promise<SeriesPoint[]> => {
  const target = requireField(model, field, 'filterable')
  if (target.type !== 'date' && target.type !== 'timestamp') {
    throw new QueryError('unsupported_field_type', `Series needs a date or timestamp field, "${field}" is ${target.type}`)
  }
  if (!Object.hasOwn(approxMs, options.granularity)) throw new QueryError('invalid_option', 'Unknown granularity')
  const timeZone = options.timeZone ?? 'UTC'
  checkTimeZone(timeZone)

  const from = rangeBound(options.range.from, target)
  const to = rangeBound(options.range.to, target)
  const spanMs = new Date(to).getTime() - new Date(from).getTime()
  if (!(spanMs > 0)) throw new QueryError('invalid_option', 'range.to must be after range.from')
  if (spanMs / approxMs[options.granularity] > maxBuckets) {
    throw new QueryError('invalid_option', `Range spans more than ${maxBuckets} buckets`)
  }

  const { measure } = options
  const amount = measure ? measureSql(model, measure) : undefined
  await assertFilterRequirements(db, options.filter, options.scope)
  const col = columnRef(target)
  const unit = sql.lit(options.granularity)
  const step = sql`${sql.lit(`1 ${options.granularity}`)}::interval`
  const isDate = target.type === 'date'
  const bound = sql.raw(isDate ? 'date' : 'timestamptz')
  const local = (value: Parameters<typeof sql>[1] | unknown) =>
    isDate ? sql`${value}::timestamp` : sql`(${value}::timestamptz at time zone ${timeZone}::text)`
  const laterBucket = sql`date_trunc(${unit}, ${local(to)} - interval '1 microsecond')`

  const counts = baseQuery(db, model, options.filter, options.scope)
    .where(sql<SqlBool>`${col} >= ${from}::${bound} and ${col} < ${to}::${bound}`)
    .select([
      sql`date_trunc(${unit}, ${isDate ? sql`${col}::timestamp` : local(col)})`.as('bucket'),
      sql`count(*)::text`.as('n'),
      ...(amount ? [sql`${amount}::text`.as('m')] : []),
    ])
    .groupBy(sql`1`)

  const result = await sql<{ bucket: string; n: unknown; m?: unknown }>`
    with b as (
      select generate_series(date_trunc(${unit}, ${local(from)}), ${laterBucket}, ${step}) as bucket
    ), c as (${counts})
    select to_char(b.bucket, 'YYYY-MM-DD"T"HH24:MI:SS') as bucket, coalesce(c.n, '0') as n${amount ? sql`, c.m` : sql``}
    from b left join c on c.bucket = b.bucket
    order by b.bucket
  `.execute(db)
  return result.rows.map(row => {
    const point = { bucket: row.bucket, count: toNumber(row.n) }
    return measure ? { ...point, [measure.kind]: measureValue(row.m) } : point
  })
}
