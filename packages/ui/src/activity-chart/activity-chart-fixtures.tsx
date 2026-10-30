import { useState } from 'react'
import { activitySeries } from '../mocks'
import { ActivityChart, type ActivityChartProps } from './activity-chart'

/** The chart on the sample series, switching between day and week like a chart fed by a server. */
export const SampleActivityChart = ({ defaultGranularity = 'day', ...props }: Omit<ActivityChartProps, 'data' | 'granularity' | 'onGranularityChange'>) => {
  const [granularity, setGranularity] = useState(defaultGranularity)
  return <ActivityChart {...props} data={activitySeries(granularity)} granularity={granularity} onGranularityChange={setGranularity} />
}
