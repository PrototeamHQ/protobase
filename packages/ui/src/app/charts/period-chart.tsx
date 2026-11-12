import { useState, type KeyboardEvent } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ChartBucket } from '@protobase/layout'
import { useMediaQuery } from '../../lib/use-media-query'
import type { ViewModel } from '@protobase/schema'
import { measureText, type ChartMeasure } from './chart-groups'
import { LegendItem } from './legend-item'
import type { ChartSeries } from './split-points'
import { formatTag } from '../../locale/active-locale'
import { viewerZone, zoneOffset } from '../../format/zone'
import { text } from './messages'
import { PeriodTable } from './period-table'
import { isCurrent, periodText } from './period-text'

export type Point = { at: number; value: number | null; count: number } & Record<string, number | null>

/** How long a chart's bucket is: a block's, or the minutes a record's chart of samples reads. */
export type PeriodBucket = ChartBucket | 'minute' | '5_minutes' | '15_minutes'

const clock = { hour: '2-digit', minute: '2-digit', hour12: false } as const
const dayAndClock = { day: 'numeric', month: 'short', ...clock } as const

const formats: Record<PeriodBucket, Intl.DateTimeFormatOptions> = {
  minute: clock,
  '5_minutes': clock,
  '15_minutes': clock,
  hour: clock,
  day: { day: 'numeric', month: 'short' },
  week: { day: 'numeric', month: 'short' },
  month: { month: 'short', year: '2-digit' },
  year: { year: 'numeric' },
}

const formatterOf = (options: Intl.DateTimeFormatOptions) => {
  const format = new Intl.DateTimeFormat(formatTag(), { ...options, timeZone: 'UTC' })
  return (ms: number) => format.format(ms)
}

const axisTick = { fontSize: '0.6875rem', fill: 'var(--muted-foreground)' }

const dayMs = 86_400_000
const withinDay: ReadonlySet<PeriodBucket> = new Set(['minute', '5_minutes', '15_minutes', 'hour'])

// Buckets shorter than a day name their time, and their day too once the points span more than one
const tickFormat = (bucket: PeriodBucket, points: Point[]) => {
  const span = points.length > 1 ? points.at(-1)!.at - points[0]!.at : 0
  return withinDay.has(bucket) && span >= dayMs ? dayAndClock : formats[bucket]
}

// Now on the viewer's wall clock, written as UTC milliseconds as the points' bucket starts are
const wallNow = () => {
  const now = Date.now()
  return now + zoneOffset(now, viewerZone())
}

const PointTooltip = ({ active, payload, measure, bucket, now, series }: { active?: boolean; payload?: Array<{ payload: Point }>; measure: ChartMeasure; bucket: PeriodBucket; now: number; series?: ChartSeries[] }) => {
  const point = payload?.[0]?.payload
  if (!active || !point) return null
  return (
    <div className="rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-pop">
      <div className="text-muted-foreground">{periodText(point.at, bucket, now)}</div>
      {series?.map((part) => (
        <div key={part.key} className="flex items-center gap-2">
          <span className="size-2 shrink-0 rounded-full" style={{ background: part.color }} aria-hidden />
          <span className="flex-1">{part.label}</span>
          <span className="font-semibold tabular-nums">{measureText(point[part.key] ?? null, part.measure ?? measure)}</span>
        </div>
      ))}
      {series && (measure.kind === 'count' || measure.kind === 'sum') && <div className="mt-0.5 border-t pt-0.5 font-semibold tabular-nums">{measureText(point.value, measure)}</div>}
      {!series && <div className="font-semibold tabular-nums">{measureText(point.value, measure)}</div>}
    </div>
  )
}

// The current bucket's bar, still filling up: outlined with a dash and filled faintly, so it does not read as a drop
const currentBar = (color: string) => ({ fillOpacity: 0.35, stroke: color, strokeWidth: 1.5, strokeDasharray: '3 2' })

// The surface the keyboard reads, with the focus ring every control shows
const focusRing = '[&_.recharts-surface]:rounded-sm [&_.recharts-surface:focus-visible]:outline-2 [&_.recharts-surface:focus-visible]:outline-offset-2 [&_.recharts-surface:focus-visible]:outline-primary'

/**
 * A date field's buckets over time, as bars or a line; a bucket without a value to add up is a gap. The bucket still
 * running is drawn hollow. The chart takes focus: the arrow keys move its tooltip from bucket to bucket and Escape
 * closes it, and a table only a screen reader reads holds the same numbers.
 */
export const PeriodChart = ({ points, measure, bucket, type, series, resource, view }: { points: Point[]; measure: ChartMeasure; bucket: PeriodBucket; type: 'bar' | 'line'; series?: ChartSeries[]; resource?: string; view?: ViewModel }) => {
  const wide = useMediaQuery('(min-width: 640px)')
  const [closed, setClosed] = useState(false)
  const now = wallNow()
  const current = points.findIndex((point) => isCurrent(point.at, bucket, now))
  const tick = formatterOf(tickFormat(bucket, points))
  const grid = <CartesianGrid vertical={false} stroke="var(--border)" />
  const x = <XAxis dataKey="at" tickFormatter={tick} tick={axisTick} axisLine={false} tickLine={false} minTickGap={wide ? 24 : 40} height={18} />
  const y = <YAxis width={wide ? 48 : 36} tick={axisTick} axisLine={false} tickLine={false} tickCount={3} tickFormatter={(value: number) => value.toLocaleString(formatTag(), { notation: 'compact' })} />
  const tooltip = <Tooltip {...(closed && { active: false })} cursor={type === 'bar' ? { fill: 'var(--muted)' } : { stroke: 'var(--border-strong)' }} content={<PointTooltip measure={measure} bucket={bucket} now={now} {...(series && { series })} />} isAnimationActive={false} />
  const parts = series ?? [{ key: 'value', label: '', color: 'var(--chart-1)' }]
  const dot = (color: string) => ({ cx, cy, index }: { cx?: number; cy?: number; index: number }) => {
    if (cx === undefined || cy === undefined) return null
    if (index === current) return <circle cx={cx} cy={cy} r={3.5} fill="var(--background)" stroke={color} strokeWidth={2} />
    return points.length <= 31 ? <circle cx={cx} cy={cy} r={3} fill={color} /> : null
  }
  // Escape closes the tooltip the arrow keys opened; a key that moves it or a pointer opens it again
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => setClosed(event.key === 'Escape')
  const open = () => setClosed(false)
  const surface = { 'aria-label': text('chartKeys') }
  const chart = (
    <div className={`h-40 ${focusRing}`} onKeyDown={onKeyDown} onPointerMove={open} onFocus={open}>
      <ResponsiveContainer width="100%" height="100%">
        {type === 'line' ? (
          <LineChart data={points} margin={{ top: 6, right: 6, bottom: 0, left: 0 }} {...surface}>
            {grid}
            {x}
            {y}
            {tooltip}
            {parts.map((part) => (
              <Line key={part.key} dataKey={part.key} stroke={part.color} strokeWidth={2} dot={dot(part.color)} activeDot={{ r: 4, stroke: 'var(--background)', strokeWidth: 2 }} isAnimationActive={false} />
            ))}
          </LineChart>
        ) : (
          <BarChart data={points} margin={{ top: 6, right: 0, bottom: 0, left: 0 }} barCategoryGap="22%" {...surface}>
            {grid}
            {x}
            {y}
            {tooltip}
            {parts.map((part, index) => (
              <Bar key={part.key} dataKey={part.key} fill={part.color} {...(series && { stackId: 'split' })} radius={index === parts.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false}>
                {points.map((point, at) => (
                  <Cell key={point.at} {...(at === current && currentBar(part.color))} />
                ))}
              </Bar>
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
      <PeriodTable points={points} measure={measure} bucket={bucket} now={now} {...(series && { series })} />
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
