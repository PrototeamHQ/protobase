import { useState } from 'react'
import type { ChartModel } from '@protobase/schema'
import { useSeries } from '../data/use-aggregates'
import { ActivityChart } from '../activity-chart'

const periods = { '7d': 'last 7 days', '30d': 'last 30 days', '90d': 'last 90 days', '1y': 'last year', all: 'all time' }

/** The view's chart, drawn from `:series` with the list's current filter. */
export const ListChart = ({ resource, chart, title, noun, filter }: { resource: string; chart: ChartModel; title: string; noun: string; filter: string }) => {
  const [granularity, setGranularity] = useState<'day' | 'week'>(chart.granularity === 'week' ? 'week' : 'day')
  const range = granularity === 'week' ? '90d' : chart.range
  const series = useSeries(resource, { field: chart.field, range, granularity, filter })
  const data = series.data?.points.map((point) => ({ at: Date.parse(`${point.bucket}Z`), count: point.count })) ?? []
  return (
    <ActivityChart
      title={title}
      noun={noun}
      data={data}
      granularity={granularity}
      onGranularityChange={setGranularity}
      periodLabel={granularity === 'week' ? 'last 12 weeks' : periods[range]}
    />
  )
}
