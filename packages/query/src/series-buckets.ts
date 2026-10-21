import { sql } from 'kysely'
import type { ResourceModel } from '@protobase/schema'
import { columnRef, requireField } from './columns'
import { QueryError } from './errors'
import { rangeBound } from './range-bound'

const maxBuckets = 10_000
const approxMs = { minute: 60_000, '5_minutes': 300_000, '15_minutes': 900_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000, month: 2_629_800_000, year: 31_557_600_000 }
// Buckets of several minutes start on the clock's multiples of them, which `date_trunc` has no unit for
const minuteStrides: Partial<Record<keyof typeof approxMs, string>> = { '5_minutes': '5 minutes', '15_minutes': '15 minutes' }

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
  const stride = minuteStrides[options.granularity]
  const step = sql`${sql.lit(stride ?? `1 ${options.granularity}`)}::interval`
  const truncate = (value: unknown) =>
    stride ? sql`date_bin(${step}, ${value}, timestamp '2000-01-01')` : sql`date_trunc(${sql.lit(options.granularity)}, ${value})`
  const isDate = target.type === 'date'
  const bound = sql.raw(isDate ? 'date' : 'timestamptz')
  const local = (value: Parameters<typeof sql>[1] | unknown) =>
    isDate ? sql`${value}::timestamp` : sql`(${value}::timestamptz at time zone ${timeZone}::text)`
  const laterBucket = truncate(sql`${local(to)} - interval '1 microsecond'`)
  return { target, col, from, to, truncate, step, bound, local, laterBucket, isDate }
}
