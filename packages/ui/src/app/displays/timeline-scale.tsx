import type { Ref } from 'react'
import { cn } from '../../lib/cn'
import type { TimelineTick } from './timeline-range'

/** A timeline's columns: the records' titles beside their bars, above them on a phone. */
export const timelineGrid = 'grid grid-cols-1 sm:grid-cols-[12rem_minmax(0,1fr)]'

/** Where `count` days of `total` end, as a share of the bars' width. */
export const share = (count: number, total: number) => `${(count / total) * 100}%`

type ScaleProps = {
  ticks: TimelineTick[]
  days: string[]
  today: string
  /** The heading over the titles: the lanes' field, or the records. */
  label: string
  /** The bars' width, which a day dragged across is a share of. */
  trackRef: Ref<HTMLDivElement>
}

/** The scale over a timeline's rows: the marks of its days or months, today's marked. */
export const TimelineScale = ({ ticks, days, today, label, trackRef }: ScaleProps) => (
  <div className={cn(timelineGrid, 'border-b border-border bg-surface')}>
    <span className="hidden truncate px-2 py-1 text-xs font-medium text-muted-foreground sm:block">{label}</span>
    <div ref={trackRef} aria-hidden className="relative h-6">
      {ticks.map((tick) => (
        <span
          key={tick.index}
          className={cn(
            'absolute inset-y-0 items-center truncate px-1 text-xs tabular-nums text-muted-foreground',
            // The first line, beside the titles, is the frame's own on a phone
            tick.index > 0 ? 'border-l border-border' : 'border-border sm:border-l',
            tick.minor ? 'hidden sm:flex' : 'flex',
            tick.span === 1 && days[tick.index] === today && 'font-medium text-primary',
          )}
          style={{ left: share(tick.index, days.length), width: share(tick.span, days.length) }}
        >
          {tick.label}
        </span>
      ))}
    </div>
  </div>
)

/** The lines behind a timeline's rows where each mark starts, and today's day shaded. */
export const TimelineLines = ({ ticks, days, today }: Omit<ScaleProps, 'label' | 'trackRef'>) => {
  const at = days.indexOf(today)
  return (
    <div aria-hidden className={cn(timelineGrid, 'pointer-events-none absolute inset-0')}>
      <span className="hidden sm:block" />
      <div className="relative">
        {at >= 0 && <span className="absolute inset-y-0 bg-primary/10" style={{ left: share(at, days.length), width: share(1, days.length) }} />}
        {ticks.map((tick) => (
          <span key={tick.index} className={cn('absolute inset-y-0 w-px bg-border', (tick.minor || tick.index === 0) && 'hidden sm:block')} style={{ left: share(tick.index, days.length) }} />
        ))}
      </div>
    </div>
  )
}
