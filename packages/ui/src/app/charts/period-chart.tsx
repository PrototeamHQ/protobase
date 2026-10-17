import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ChartBucket } from '@protobase/layout'
import { useMediaQuery } from '../../lib/use-media-query'
import { measureText, type ChartMeasure } from './chart-groups'

type Point = { at: number; value: number | null; count: number }

const formats: Record<ChartBucket, Intl.DateTimeFormatOptions> = {
  hour: { hour: '2-digit', minute: '2-digit', hour12: false },
  day: { day: 'numeric', month: 'short' },
  week: { day: 'numeric', month: 'short' },
  month: { month: 'short', year: '2-digit' },
  year: { year: 'numeric' },
}

const tooltipFormats: Record<ChartBucket, Intl.DateTimeFormatOptions> = {
  hour: { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false },
  day: { day: 'numeric', month: 'short', year: 'numeric' },
  week: { day: 'numeric', month: 'short', year: 'numeric' },
  month: { month: 'long', year: 'numeric' },
  year: { year: 'numeric' },
}

const formatterOf = (options: Intl.DateTimeFormatOptions) => {
  const format = new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' })
  return (ms: number) => format.format(ms)
}

const axisTick = { fontSize: 11, fill: 'var(--muted-foreground)' }

const PointTooltip = ({ active, payload, measure, bucket }: { active?: boolean; payload?: Array<{ payload: Point }>; measure: ChartMeasure; bucket: ChartBucket }) => {
  const point = payload?.[0]?.payload
  if (!active || !point) return null
  return (
    <div className="rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-pop">
      <div className="text-muted-foreground">{(bucket === 'week' ? 'Week of ' : '') + formatterOf(tooltipFormats[bucket])(point.at)}</div>
      <div className="font-semibold tabular-nums">{measureText(point.value, measure)}</div>
    </div>
  )
}

/** A date field's buckets over time, as bars or a line; a bucket without a value to add up is a gap. */
export const PeriodChart = ({ points, measure, bucket, type }: { points: Point[]; measure: ChartMeasure; bucket: ChartBucket; type: 'bar' | 'line' }) => {
  const wide = useMediaQuery('(min-width: 640px)')
  const tick = formatterOf(formats[bucket])
  const grid = <CartesianGrid vertical={false} stroke="var(--border)" />
  const x = <XAxis dataKey="at" tickFormatter={tick} tick={axisTick} axisLine={false} tickLine={false} minTickGap={wide ? 24 : 40} height={18} />
  const y = <YAxis width={wide ? 48 : 36} tick={axisTick} axisLine={false} tickLine={false} tickCount={3} tickFormatter={(value: number) => value.toLocaleString('en-IE', { notation: 'compact' })} />
  const tooltip = <Tooltip cursor={type === 'bar' ? { fill: 'var(--muted)' } : { stroke: 'var(--border-strong)' }} content={<PointTooltip measure={measure} bucket={bucket} />} isAnimationActive={false} />
  return (
    <div className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        {type === 'line' ? (
          <LineChart data={points} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
            {grid}
            {x}
            {y}
            {tooltip}
            <Line dataKey="value" stroke="var(--chart-1)" strokeWidth={2} dot={points.length <= 31 ? { r: 3, fill: 'var(--chart-1)', strokeWidth: 0 } : false} activeDot={{ r: 4, stroke: 'var(--background)', strokeWidth: 2 }} isAnimationActive={false} />
          </LineChart>
        ) : (
          <BarChart data={points} margin={{ top: 6, right: 0, bottom: 0, left: 0 }} barCategoryGap="22%">
            {grid}
            {x}
            {y}
            {tooltip}
            <Bar dataKey="value" fill="var(--chart-1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}
