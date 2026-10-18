import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import type { AppAddress, CalendarView } from '@protobase/schema'
import { formatDayRange, formatMonth } from '../../format/date'
import { buttonClass } from '../../primitives/button'
import { segmentedClass } from '../../primitives/segmented'
import { AppLink } from '../use-app-address'
import { calendarView, gridDays, stepView, todayView } from './calendar-range'

type ControlsProps = {
  view: CalendarView
  now: number
  /** The address that shows the calendar at a view: the controls are links to it. */
  linkTo?: (view: CalendarView) => AppAddress
  /** Shows the calendar at a view, for a calendar without an address of its own: the controls are buttons. */
  onView?: (view: CalendarView) => void
}

/** The heading of the month or week a calendar shows. */
export const periodText = (view: CalendarView) => {
  const days = gridDays(view)
  const ms = (day: string) => Date.parse(`${day}T00:00:00Z`)
  return view.scale === 'month' ? formatMonth(ms(view.day)) : formatDayRange(ms(days[0]!), ms(days.at(-1)!))
}

/**
 * The month or week a calendar shows, with the way to the one before, the one holding today, the one after, and the
 * month or the week: links when the calendar's view is in the address, so each opens in a new tab, else buttons.
 */
export const CalendarControls = ({ view, now, linkTo, onView }: ControlsProps) => {
  const control = (to: CalendarView, className: string, label: string, children: ReactNode, current?: boolean) =>
    linkTo ? (
      <AppLink to={linkTo(to)} className={className} aria-label={label} aria-current={current ? 'page' : undefined}>
        {children}
      </AppLink>
    ) : (
      <button type="button" className={className} aria-label={label} aria-pressed={current} onClick={() => onView?.(to)}>
        {children}
      </button>
    )
  // A month opens the week holding today when it holds today, else its first week; a week opens its month
  const holdsToday = view.scale === 'month' && new Date(now).toISOString().startsWith(view.day.slice(0, 7))
  const scaled = (to: CalendarView['scale']) => (to === 'week' && holdsToday ? todayView('week', now) : calendarView({ scale: to, day: view.day }, now))
  const scale = (to: CalendarView['scale'], label: string) => control(scaled(to), segmentedClass.option(view.scale === to), label, label, view.scale === to)
  const unit = view.scale === 'month' ? 'month' : 'week'
  const square = buttonClass({ variant: 'secondary', size: 'sm' })
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-medium">{periodText(view)}</h2>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          {control(stepView(view, -1), square, `Previous ${unit}`, <ChevronLeft className="size-3.5" />)}
          {control(todayView(view.scale, now), square, 'Today', 'Today')}
          {control(stepView(view, 1), square, `Next ${unit}`, <ChevronRight className="size-3.5" />)}
        </div>
        <span role="group" aria-label="Calendar scale" className={segmentedClass.group()}>
          {scale('month', 'Month')}
          {scale('week', 'Week')}
        </span>
      </div>
    </div>
  )
}
