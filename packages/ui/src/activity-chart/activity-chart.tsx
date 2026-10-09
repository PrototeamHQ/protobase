import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatDayShort } from '../format/date'
import { formatInt } from '../format/number'
import { activitySeries, type ActivityGranularity } from '../mocks'
import { Segmented } from '../primitives/segmented'
import { cn } from '../lib/cn'
import { useMediaQuery } from '../lib/use-media-query'
import { halfOverHalfDelta, totalCount } from './activity-math'
import { ActivityTooltip } from './activity-tooltip'

export type ActivityChartProps = {
  title?: string
  /** Plural noun used in the tooltip. */
  noun?: string
  defaultGranularity?: ActivityGranularity
  /** Real data. Without it the chart draws mock series. */
  data?: Array<{ at: number; count: number }>
  /** Controlled granularity, for charts whose data comes from a server. */
  granularity?: ActivityGranularity
  onGranularityChange?: (granularity: ActivityGranularity) => void
  /** Text after the total, for example "last 30 days". */
  periodLabel?: string
  className?: string
}

const axisTick = { fontSize: 11, fill: 'var(--muted-foreground)' }

export const ActivityChart = ({ title = 'Orders created', noun = 'orders', defaultGranularity = 'day', data, granularity: controlled, onGranularityChange, periodLabel, className }: ActivityChartProps) => {
  const [local, setLocal] = useState(defaultGranularity)
  const granularity = controlled ?? local
  const setGranularity = onGranularityChange ?? setLocal
  const series = data ?? activitySeries(granularity)
  const wide = useMediaQuery('(min-width: 640px)')
  const delta = halfOverHalfDelta(series)

  return (
    <section className={cn('rounded-lg border bg-background px-4 pb-2 pt-3', className)}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[13px] font-semibold">{title}</h2>
          <span className="text-[13px] font-semibold tabular-nums">{formatInt(totalCount(series))}</span>
          <span className={cn('text-xs font-medium tabular-nums', delta >= 0 ? 'text-success-text' : 'text-danger-text')}>
            {delta >= 0 ? '+' : '−'}
            {Math.abs(delta).toFixed(1)}%
          </span>
          <span className="hidden text-xs text-muted-foreground sm:inline">{periodLabel ?? `last ${granularity === 'day' ? '30 days' : '12 weeks'}`}</span>
        </div>
        <Segmented
          value={granularity}
          onChange={setGranularity}
          options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }]}
        />
      </header>
      <div className="mt-2 h-24">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={series} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap={granularity === 'day' ? '22%' : '30%'}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="at" padding={{ left: 4, right: wide ? 4 : 18 }} tickFormatter={formatDayShort} tick={axisTick} axisLine={false} tickLine={false} interval={granularity === 'day' ? (wide ? 4 : 9) : wide ? 1 : 3} height={18} />
            <YAxis width={wide ? 36 : 28} tick={axisTick} axisLine={false} tickLine={false} tickCount={3} />
            <Tooltip cursor={{ fill: 'var(--muted)' }} content={<ActivityTooltip noun={noun} />} isAnimationActive={false} />
            <Bar dataKey="count" fill="var(--primary)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
