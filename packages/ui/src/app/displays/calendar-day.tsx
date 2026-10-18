import { useDroppable } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import { formatWeekday, formatWeekdayDate } from '../../format/date'
import { cn } from '../../lib/cn'
import { dayId } from './calendar-dnd'

type DayProps = {
  day: string
  /** How many events are on it, the hidden ones included. */
  count: number
  /** Its events, as many as it shows. */
  children: ReactNode
  /** The link to the rest of its events, when it does not show them all. */
  more?: ReactNode
  /** Whether it lies in a month view's month, rather than the days around it. */
  inMonth: boolean
  today: boolean
  /** A week view's day, headed by its weekday and taller, rather than a month view's cell. */
  week: boolean
}

/** A day of a calendar, where an event is dropped: headed by its number, today marked, its events in start order. */
export const CalendarDay = ({ day, count, children, more, inMonth, today, week }: DayProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: dayId(day) })
  const ms = Date.parse(`${day}T00:00:00Z`)
  return (
    <section
      ref={setNodeRef}
      aria-label={`${formatWeekdayDate(ms)}, ${count}`}
      className={cn('flex min-w-0 flex-col gap-1 bg-background p-1', week ? 'min-h-28 sm:min-h-64' : 'min-h-24', !inMonth && 'bg-surface', isOver && 'ring-2 ring-inset ring-primary/30')}
    >
      <header className={cn('flex items-center gap-1 px-0.5 text-xs', inMonth ? 'text-foreground' : 'text-muted-foreground')}>
        {week && <span className="text-muted-foreground">{formatWeekday(ms)}</span>}
        <span aria-current={today ? 'date' : undefined} className={cn('inline-flex size-5 items-center justify-center rounded-full tabular-nums', today && 'bg-primary font-medium text-primary-foreground')}>
          {Number(day.slice(8))}
        </span>
      </header>
      {children}
      {more}
    </section>
  )
}
