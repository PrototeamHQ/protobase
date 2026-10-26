import { makeRng, type Rand } from './rng'

export const DAY = 86_400_000

export const windowEnd = Date.UTC(2026, 9, 6, 9, 41)
export const windowStart = windowEnd - 3 * 365 * DAY

export const yearOf = (ms: number) => new Date(ms).getUTCFullYear()

// Sunday first. Weekdays carry the traffic, Saturday a fifth, Sunday almost nothing.
const dayShare = [0.05, 1.15, 1.1, 1.05, 1.0, 0.85, 0.2]

const HOUR = 3_600_000

// Time of day in ms: mostly business hours with a midday-ish peak, some early and evening traffic.
const timeOfDay = (weekday: number, rand: Rand) => {
  const roll = rand()
  if (weekday === 0 || weekday === 6) return (9 + 6 * rand()) * HOUR
  if (roll < 0.82) return (8 + (9 * (rand() + rand())) / 2) * HOUR
  if (roll < 0.9) return (6 + 2 * rand()) * HOUR
  return (17 + 5 * rand()) * HOUR
}

// A moment `delay` after `at`; when that would pass the end of the window, somewhere between `at` and the end.
export const within = (at: number, delay: number, rand: Rand) => (at + delay <= windowEnd ? at + delay : at + Math.floor(rand() * (windowEnd - at)))

// Ascending timestamps (ms) spread over the window: weekday/weekend pattern,
// slow growth over three years, a quieter December and day-to-day noise.
// Times never leave the window, and the first and last day are partial days.
export const timestamps = (count: number, seed: number) => {
  const rand = makeRng(seed)
  const firstDay = Math.floor(windowStart / DAY) * DAY
  const days = Math.ceil((windowEnd - firstDay) / DAY)
  const bounds = (d: number) => [Math.max(firstDay + d * DAY, windowStart), Math.min(firstDay + (d + 1) * DAY, windowEnd)] as const
  const weights = Array.from({ length: days }, (_, d) => {
    const date = new Date(firstDay + d * DAY)
    const [lo, hi] = bounds(d)
    const season = date.getUTCMonth() === 11 ? 0.8 : 1
    return dayShare[date.getUTCDay()]! * ((hi - lo) / DAY) * (0.7 + (0.3 * d) / days) * season * (0.85 + 0.3 * rand())
  })
  const total = weights.reduce((sum, weight) => sum + weight, 0)

  const times = new Float64Array(count)
  let assigned = 0
  let cumulative = 0
  for (let d = 0; d < days; d++) {
    cumulative += weights[d]!
    const dayCount = Math.round((count * cumulative) / total) - assigned
    const [lo, hi] = bounds(d)
    const day = firstDay + d * DAY
    const weekday = new Date(day).getUTCDay()
    const sampled = Array.from({ length: dayCount }, () => {
      const at = Math.floor(day + timeOfDay(weekday, rand))
      return at >= lo && at <= hi ? at : lo + Math.floor(rand() * (hi - lo))
    }).sort((a, b) => a - b)
    times.set(sampled, assigned)
    assigned += dayCount
  }
  return times
}

// Months as the UTC midnight of their first day. Leases start on a first and end on a last day of a month.
export const monthOf = (ms: number) => {
  const date = new Date(ms)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
}

export const addMonths = (month: number, count: number) => {
  const date = new Date(month)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1)
}

export const lastDayOf = (month: number) => addMonths(month, 1) - DAY

/** The first rent period inside the window, and the last one (the month the window ends in). */
export const firstPeriod = addMonths(monthOf(windowStart), 1)
export const lastPeriod = monthOf(windowEnd)
