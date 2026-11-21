import { useState } from 'react'
import { formatInt } from '../format/number'
import { Segmented } from '../primitives/segmented'
import { Skeleton } from '../primitives/skeleton'
import { cn } from '../lib/cn'
import { PeriodChart } from '../app/charts/lazy-charts'
import { halfOverHalfDelta, totalCount } from './activity-math'
import { text } from './messages'

export type ActivityGranularity = 'day' | 'week'

export type ActivityChartProps = {
  title: string
  defaultGranularity?: ActivityGranularity
  /** The counts to draw; an empty series draws an empty chart. */
  data: Array<{ at: number; count: number }>
  /** Controlled granularity, for charts whose data comes from a server. */
  granularity?: ActivityGranularity
  onGranularityChange?: (granularity: ActivityGranularity) => void
  /** Text after the total, for example "last 30 days". */
  periodLabel?: string
  /** `loading` while the counts are on their way, `failed` when they could not be loaded: no total or bars then. */
  state?: 'loading' | 'failed'
  className?: string
}

/** Counts per day or week under their total and change, drawn as a date chart's bars with its tooltip, keys and table. */
export const ActivityChart = ({ title, defaultGranularity = 'day', data, granularity: controlled, onGranularityChange, periodLabel, state, className }: ActivityChartProps) => {
  const [local, setLocal] = useState(defaultGranularity)
  const granularity = controlled ?? local
  const setGranularity = onGranularityChange ?? setLocal
  const delta = halfOverHalfDelta(data)
  const points = data.map(({ at, count }) => ({ at, value: count, count }))

  return (
    <section className={cn('rounded-lg border bg-background px-4 pb-2 pt-3', className)}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="font-semibold">{title}</h2>
          {state === undefined && (
            <>
              <span className="font-semibold tabular-nums">{formatInt(totalCount(data))}</span>
              <span className={cn('text-xs font-medium tabular-nums', delta >= 0 ? 'text-success-text' : 'text-danger-text')}>
                {delta >= 0 ? '+' : '−'}
                {Math.abs(delta).toFixed(1)}%
              </span>
            </>
          )}
          <span className="hidden text-xs text-muted-foreground sm:inline">{periodLabel ?? `last ${granularity === 'day' ? '30 days' : '12 weeks'}`}</span>
        </div>
        <Segmented
          value={granularity}
          onChange={setGranularity}
          options={[{ value: 'day', label: text('day') }, { value: 'week', label: text('week') }]}
        />
      </header>
      <div className="mt-2">
        {state === 'failed' && <p className="py-6 text-danger-text">{text('couldNotLoad')}</p>}
        {state === 'loading' && <Skeleton className="h-24 w-full" />}
        {state === undefined && <PeriodChart points={points} measure={{ kind: 'count' }} bucket={granularity} type="bar" compact />}
      </div>
    </section>
  )
}
