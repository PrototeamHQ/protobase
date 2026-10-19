import { sql } from 'kysely'
import type { ResourceModel } from '@protobase/schema'
import { columnRef, requireField } from './columns'
import { QueryError } from './errors'
import { rangeBound } from './range-bound'

const maxBuckets = 10_000
const approxMs = { hour: 3_600_000, day: 86_400_000, week: 604_800_000, month: 2_629_800_000, year: 31_557_600_000 }

export type Granularity = keyof typeof approxMs
export type BucketOptions = {
  range: { from: string | Date; to: string | Date }
  granularity: Granularity
  timeZone?: string
}

const checkTimeZone = (timeZone: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone })
  } catch (error) {
    if (error instanceof RangeError) throw new QueryError('invalid_option', `Unknown time zone "${timeZone}"`)
    throw error
  }
}

/**
 * Validates a date or timestamp field, range, granularity and time zone, and builds the SQL pieces that bucket the
 * field over time. Shared by `series` and `splitSeries`.
 */
export const seriesBuckets = (model: ResourceModel, field: string, options: BucketOptions) => {
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

  const col = columnRef(target)
  const unit = sql.lit(options.granularity)
  const step = sql`${sql.lit(`1 ${options.granularity}`)}::interval`
  const isDate = target.type === 'date'
  const bound = sql.raw(isDate ? 'date' : 'timestamptz')
  const local = (value: Parameters<typeof sql>[1] | unknown) =>
    isDate ? sql`${value}::timestamp` : sql`(${value}::timestamptz at time zone ${timeZone}::text)`
  const laterBucket = sql`date_trunc(${unit}, ${local(to)} - interval '1 microsecond')`
  return { target, col, from, to, unit, step, bound, local, laterBucket, isDate }
}
