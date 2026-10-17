// The percentiles of a window of durations and how its p50 compares with a target, in seconds.

/** The nearest-rank percentile: the smallest value at least `percent` of the values are at or under. */
export const percentile = (values: number[], percent: number) => {
  if (values.length === 0) throw new Error('no values to take a percentile of')
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.max(1, Math.ceil((percent / 100) * sorted.length))
  return sorted[rank - 1] as number
}

export interface Summary {
  p50: number
  p90: number
  latest: number
  count: number
}

/** Durations newest first, as the API lists runs. */
export const summarize = (newestFirst: number[]): Summary => ({
  p50: percentile(newestFirst, 50),
  p90: percentile(newestFirst, 90),
  latest: newestFirst[0] as number,
  count: newestFirst.length,
})

export interface Verdict {
  met: boolean
  /** How far the p50 is under the target when met, over it when not. */
  margin: number
}

export const judge = (p50: number, target: number): Verdict => ({ met: p50 <= target, margin: Math.abs(target - p50) })

/** 14m10s, 45s, 10m: whole seconds, and minutes past 60 rather than hours. */
export const formatDuration = (value: number) => {
  const total = Math.round(value)
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  if (minutes === 0) return `${rest}s`
  return rest === 0 ? `${minutes}m` : `${minutes}m${String(rest).padStart(2, '0')}s`
}

export const describeVerdict = (name: string, p50: number, target: number) => {
  const { met, margin } = judge(p50, target)
  const how = met ? `met, ${formatDuration(margin)} under` : `not met, ${formatDuration(margin)} over`
  return `${name} p50 ${formatDuration(p50)} vs target ${formatDuration(target)}: ${how}`
}
