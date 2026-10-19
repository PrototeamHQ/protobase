import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ChartBucket } from '@protobase/layout'
import { useMediaQuery } from '../../lib/use-media-query'
import type { ViewModel } from '@protobase/schema'
import { measureText, type ChartMeasure } from './chart-groups'
import { LegendItem } from './legend-item'
import type { ChartSeries } from './split-points'
import { formatTag } from '../../locale/active-locale'
import { text } from './messages'

type Point = { at: number; value: number | null; count: number } & Record<string, number | null>

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
  const format = new Intl.DateTimeFormat(formatTag(), { ...options, timeZone: 'UTC' })
  return (ms: number) => format.format(ms)
}

const axisTick = { fontSize: 11, fill: 'var(--muted-foreground)' }

const PointTooltip = ({ active, payload, measure, bucket, series }: { active?: boolean; payload?: Array<{ payload: Point }>; measure: ChartMeasure; bucket: ChartBucket; series?: ChartSeries[] }) => {
  const point = payload?.[0]?.payload
  if (!active || !point) return null
  return (
    <div className="rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-pop">
      <div className="text-muted-foreground">{bucket === 'week' ? text('weekOf', formatterOf(tooltipFormats[bucket])(point.at)) : formatterOf(tooltipFormats[bucket])(point.at)}</div>
      {series?.map((part) => (
        <div key={part.key} className="flex items-center gap-2">
          <span className="size-2 shrink-0 rounded-full" style={{ background: part.color }} aria-hidden />
          <span className="flex-1">{part.label}</span>
          <span className="font-semibold tabular-nums">{measureText(point[part.key] ?? null, measure)}</span>
        </div>
      ))}
      {series && measure.kind !== 'average' && <div className="mt-0.5 border-t pt-0.5 font-semibold tabular-nums">{measureText(point.value, measure)}</div>}
      {!series && <div className="font-semibold tabular-nums">{measureText(point.value, measure)}</div>}
    </div>
  )
}

/** A date field's buckets over time, as bars or a line; a bucket without a value to add up is a gap. */
export const PeriodChart = ({ points, measure, bucket, type, series, resource, view }: { points: Point[]; measure: ChartMeasure; bucket: ChartBucket; type: 'bar' | 'line'; series?: ChartSeries[]; resource?: string; view?: ViewModel }) => {
  const wide = useMediaQuery('(min-width: 640px)')
  const tick = formatterOf(formats[bucket])
  const grid = <CartesianGrid vertical={false} stroke="var(--border)" />
  const x = <XAxis dataKey="at" tickFormatter={tick} tick={axisTick} axisLine={false} tickLine={false} minTickGap={wide ? 24 : 40} height={18} />
  const y = <YAxis width={wide ? 48 : 36} tick={axisTick} axisLine={false} tickLine={false} tickCount={3} tickFormatter={(value: number) => value.toLocaleString(formatTag(), { notation: 'compact' })} />
  const tooltip = <Tooltip cursor={type === 'bar' ? { fill: 'var(--muted)' } : { stroke: 'var(--border-strong)' }} content={<PointTooltip measure={measure} bucket={bucket} {...(series && { series })} />} isAnimationActive={false} />
  const parts = series ?? [{ key: 'value', label: '', color: 'var(--chart-1)' }]
  const chart = (
    <div className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        {type === 'line' ? (
          <LineChart data={points} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
            {grid}
            {x}
            {y}
            {tooltip}
            {parts.map((part) => (
              <Line key={part.key} dataKey={part.key} stroke={part.color} strokeWidth={2} dot={points.length <= 31 ? { r: 3, fill: part.color, strokeWidth: 0 } : false} activeDot={{ r: 4, stroke: 'var(--background)', strokeWidth: 2 }} isAnimationActive={false} />
            ))}
          </LineChart>
        ) : (
          <BarChart data={points} margin={{ top: 6, right: 0, bottom: 0, left: 0 }} barCategoryGap="22%">
            {grid}
            {x}
            {y}
            {tooltip}
            {parts.map((part, index) => (
              <Bar key={part.key} dataKey={part.key} fill={part.color} {...(series && { stackId: 'split' })} radius={index === parts.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
  if (!series || resource === undefined) return chart
  return (
    <div className="flex flex-col gap-2">
      {chart}
      <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm">
        {series.map((part) => (
          <LegendItem key={part.key} resource={resource} view={view} color={part.color} label={part.label} {...(part.filter !== undefined && { filter: part.filter })} />
        ))}
      </ul>
    </div>
  )
}
