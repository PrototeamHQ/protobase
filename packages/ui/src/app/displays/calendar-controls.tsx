import type { AppAddress, CalendarView } from '@protobase/schema'
import { formatDayRange, formatMonth } from '../../format/date'
import { calendarView, gridDays, stepView, todayView } from './calendar-range'
import { dayIn, viewerZone } from '../../format/zone'
import { PeriodControls } from './period-controls'

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

/** The month or week a calendar shows, with the way to the one before, the one holding today, the one after, and the month or the week. */
export const CalendarControls = ({ view, now, linkTo, onView }: ControlsProps) => {
  // A month opens the week holding today when it holds today, else its first week; a week opens its month
  const holdsToday = view.scale === 'month' && dayIn(now, viewerZone()).startsWith(view.day.slice(0, 7))
  const scaled = (to: CalendarView['scale']) => (to === 'week' && holdsToday ? todayView('week', now) : calendarView({ scale: to, day: view.day }, now))
  const scale = (to: CalendarView['scale'], label: string) => ({ view: scaled(to), label, current: view.scale === to })
  return (
    <PeriodControls
      heading={periodText(view)}
      unit={view.scale === 'month' ? 'month' : 'week'}
      previous={stepView(view, -1)}
      today={todayView(view.scale, now)}
      next={stepView(view, 1)}
      scales={[scale('month', 'Month'), scale('week', 'Week')]}
      scalesLabel="Calendar scale"
      linkTo={linkTo}
      onView={onView}
    />
  )
}
