import { formatDayShort, formatTime } from '../../../../format/date'
import { viewerZone } from '../../../../format/zone'
import { axisTicks } from './timeline-layout'

// How far the viewer's clock is ahead of UTC at `ms`, so ticks fall on their whole hours and days
const offsetAt = (ms: number, zone: string) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(ms).map((part) => [part.type, part.value]))
  const local = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute))
  return local - Math.floor(ms / 60_000) * 60_000
}

// A label near an edge stays inside the axis, so it never widens the page
const anchor = (left: number) => (left < 8 ? 'translate-x-0' : left > 92 ? '-translate-x-full' : '-translate-x-1/2')

/** The time from `from` to `to` as a few ticks on the viewer's clock, as dates from a day apart, as times below. */
export const TimelineAxis = ({ from, to }: { from: number; to: number }) => {
  const zone = viewerZone()
  const offset = offsetAt(from, zone)
  const { daily, ticks } = axisTicks(from, to, offset)
  return (
    <div aria-hidden="true" className="relative h-5 min-w-0 flex-1 border-b border-border text-xs text-muted-foreground tabular-nums">
      {ticks.map((tick) => (
        <span key={tick.at} className={`absolute bottom-1 whitespace-nowrap ${anchor(tick.left)}`} style={{ left: `${tick.left}%` }}>
          {/* A day is kept in UTC, so the viewer's day is their midnight moved by their offset */}
          {daily ? formatDayShort(tick.at + offset) : formatTime(tick.at, zone)}
        </span>
      ))}
    </div>
  )
}
