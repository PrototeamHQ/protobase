import { cachedFormat } from '../../format/intl-cache'
import type { PeriodBucket } from './period-types'
import { text } from './messages'

const dayMs = 86_400_000

const clock = { hour: '2-digit', minute: '2-digit', hour12: false } as const
const dayAndClock = { day: 'numeric', month: 'short', ...clock } as const
const date = { day: 'numeric', month: 'short', year: 'numeric' } as const
const dayAndMonth = { day: 'numeric', month: 'short' } as const

// What a bucket that is one moment or one day names: its start
const pointFormats: Partial<Record<PeriodBucket, Intl.DateTimeFormatOptions>> = {
  minute: dayAndClock,
  '5_minutes': dayAndClock,
  '15_minutes': dayAndClock,
  hour: dayAndClock,
  day: date,
  year: { year: 'numeric' },
}

const formatOf = (options: Intl.DateTimeFormatOptions) => cachedFormat(`period:${JSON.stringify(options)}`, (tag) => new Intl.DateTimeFormat(tag, { ...options, timeZone: 'UTC' }))

/** When the bucket starting at `at` ends, the start of the next one; a bucket shorter than a day, a moment, has none. */
export const periodEnd = (at: number, bucket: PeriodBucket) => {
  const start = new Date(at)
  if (bucket === 'day') return at + dayMs
  if (bucket === 'week') return at + 7 * dayMs
  if (bucket === 'month') return Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)
  if (bucket === 'year') return Date.UTC(start.getUTCFullYear() + 1, 0, 1)
  return
}

/** Whether the bucket starting at `at` is still running at `now`: the period it covers has not ended yet. */
export const isCurrent = (at: number, bucket: PeriodBucket, now: number) => {
  const end = periodEnd(at, bucket)
  return at <= now && (end === undefined ? false : now < end)
}

/**
 * What a chart's bucket covers, as its tooltip and table name it: a week or month from its first to its last day, such
 * as "24 – 30 Aug 2026", and the one still running up to today, "9 Nov to today"; a year its number until it runs, a
 * day its date until it is today, and a shorter bucket its start. `at` and `now` are wall-clock times written as UTC milliseconds, as the points are.
 */
export const periodText = (at: number, bucket: PeriodBucket, now: number) => {
  if (isCurrent(at, bucket, now)) {
    if (bucket === 'day') return text('today')
    const sameYear = new Date(at).getUTCFullYear() === new Date(now).getUTCFullYear()
    return text('toToday', { start: formatOf(sameYear ? dayAndMonth : date).format(at) })
  }
  const point = pointFormats[bucket]
  if (point) return formatOf(point).format(at)
  const end = periodEnd(at, bucket)
  if (end === undefined) throw new Error(`A ${bucket} bucket has no period to name`)
  return formatOf(date).formatRange(at, end - dayMs)
}
