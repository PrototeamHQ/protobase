import { mockNow, rngAt } from './rng'

export type ActivityGranularity = 'day' | 'week'

const dayMs = 86_400_000

const dailyCounts = (days: number) =>
  Array.from({ length: days }, (_, offset) => {
    const at = mockNow - (days - 1 - offset) * dayMs
    const weekday = new Date(at).getUTCDay()
    const base = weekday === 0 || weekday === 6 ? 120 : 410
    return { at, count: Math.round(base * (0.8 + rngAt(71, offset)() * 0.45) * (1 + offset / days / 3)) }
  })

export const activitySeries = (granularity: ActivityGranularity) => {
  if (granularity === 'day') return dailyCounts(30)
  const daily = dailyCounts(84)
  return Array.from({ length: 12 }, (_, week) => {
    const chunk = daily.slice(week * 7, week * 7 + 7)
    return { at: chunk[0]!.at, count: chunk.reduce((sum, day) => sum + day.count, 0) }
  })
}
