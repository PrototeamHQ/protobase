import type { AggregateGroup } from '@protobase/client'
import type { RecordChartRange } from '@protobase/schema'
import type { PeriodBucket } from '../charts/period-chart'

/** What each bucket of a record's chart reads of its samples. */
export type SampleMeasure = 'average' | 'maximum'

/** How long a bucket is over each range: a minute over the hour, 5 minutes over the day, an hour over the week. */
export const rangeBuckets = { '1h': 'minute', '24h': '5_minutes', '7d': 'hour' } as const satisfies Record<RecordChartRange, PeriodBucket>

/** A bucket's start, read as UTC as the chart draws it, with each series' number under its key, `null` where it has none. */
export type SamplePoint = { at: number; value: number | null; count: number } & Record<string, number | null>

/**
 * The buckets of several series as one line of points, each series' number under `keys[i]`. The series come from
 * requests sent one by one, so their ranges may end a bucket apart: a bucket one of them lacks holds `null` for it, as
 * one without a sample does, which the chart draws as a gap rather than as 0.
 */
export const chartPoints = (series: AggregateGroup[][], keys: string[], measure: SampleMeasure): SamplePoint[] => {
  const points = new Map<number, SamplePoint>()
  series.forEach((groups, index) => {
    for (const group of groups) {
      const at = Date.parse(`${String(group.value)}Z`)
      const point = points.get(at) ?? ({ at, value: null, count: 0 } as SamplePoint)
      point[keys[index]!] = group[measure] ?? null
      point.count = Math.max(point.count, group.count)
      points.set(at, point)
    }
  })
  const empty = Object.fromEntries(keys.map((key) => [key, null]))
  return [...points.values()].sort((a, b) => a.at - b.at).map((point) => ({ ...empty, ...point }))
}
