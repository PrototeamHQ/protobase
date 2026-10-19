import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, type Announcements, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { useRef, useState } from 'react'
import type { AppAddress, CalendarView, ResourceModel, ViewModel } from '@protobase/schema'
import { formatDate, formatWeekday } from '../../format/date'
import { cn } from '../../lib/cn'
import { Skeleton } from '../../primitives/skeleton'
import { ErrorBanner } from '../error-banner'
import { usePermissions } from '../meta-gate'
import { can, rowAllows } from '../permissions'
import { AppLink } from '../use-app-address'
import { collision } from './board-dnd'
import { CalendarControls } from './calendar-controls'
import { CalendarDay } from './calendar-day'
import { dayCoordinates, dayId } from './calendar-dnd'
import { CalendarEvent, EventChip, eventTitle } from './calendar-event'
import { byDay, calendarView, gridDays, rangeOf, type CalendarDisplayModel } from './calendar-range'
import { dayIn, viewerZone } from '../../format/zone'
import type { ListDisplayRow } from './list-displays'
import { calendarLimit, useCalendarRows } from './use-calendar-rows'
import { movedRows, useCalendarMove } from './use-calendar-move'
import { text } from './messages'

type CalendarProps = {
  model: ResourceModel
  view: ViewModel | undefined
  display: CalendarDisplayModel
  /** The fields the events show, which the records' relations are labelled for. */
  fields: string[]
  /** The list's filter, its search included, as the list API takes it. */
  filter: string
  /** The month or week the address names; the month of today when it names none. */
  at?: CalendarView
  /** The address that shows the calendar at a view, for a calendar whose view is in the address; else it keeps its own. */
  linkTo?: (view: CalendarView) => AppAddress
  /** The time that is today, now unless a test fixes it. */
  now?: number
}

/** The events a month's day shows before a link to its week, which shows them all. */
const monthDayLimit = 3

// What an event being moved is: the record, and the day it was picked up from
type Picked = { row: ListDisplayRow; day: string }

/**
 * The list's records on the days of a month or a week, loaded for those days alone through the list API; an event
 * dragged, or moved with the keyboard, to another day saves the record with its dates moved by the same days.
 */
export const CalendarDisplay = ({ model, view, display, fields, filter, at, linkTo, now = Date.now() }: CalendarProps) => {
  const [local, setLocal] = useState<CalendarView | undefined>()
  const shown = calendarView(linkTo ? at : local, now)
  const days = gridDays(shown)
  const list = useCalendarRows({ model, display, range: rangeOf(shown), fields, filter })
  const { moves, move } = useCalendarMove(model, display)
  const placed = byDay(movedRows(list.rows, moves), display, model, days)
  const permissions = usePermissions(model.name)
  const movable = can(permissions, 'update') && [display.start, display.end].every((name) => name === undefined || !model.fields[name]?.readOnly)
  const [active, setActive] = useState<Picked | undefined>()
  // The click that ends a drag with a mouse lands on the event's link, which must not open the record
  const dragged = useRef(false)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    // Enter opens the event's record, so only Space picks an event up
    useSensor(KeyboardSensor, { keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] }, coordinateGetter: dayCoordinates }),
  )

  const today = dayIn(now, viewerZone())
  const week = shown.scale === 'week'
  const dayText = (id: unknown) => formatDate(Date.parse(`${String(id).slice(dayId('').length)}T00:00:00Z`))
  const title = (picked: Picked) => eventTitle(model, view, display, picked.row)
  const announcements: Announcements = {
    onDragStart: ({ active: picked }) => text('pickedUp', title(picked.data.current as Picked)),
    onDragOver: ({ active: picked, over }) => text('isOver', title(picked.data.current as Picked), over ? dayText(over.id) : text('noDay')),
    onDragEnd: ({ active: picked, over }) => (over ? text('wasMovedTo', title(picked.data.current as Picked), dayText(over.id)) : text('putBack', title(picked.data.current as Picked))),
    onDragCancel: ({ active: picked }) => text('cancelled', title(picked.data.current as Picked)),
  }
  const release = () => {
    setActive(undefined)
    setTimeout(() => (dragged.current = false))
  }
  const start = ({ active: picked }: DragStartEvent) => {
    dragged.current = true
    setActive(picked.data.current as Picked)
  }
  const end = ({ active: picked, over }: DragEndEvent) => {
    release()
    const { row, day } = picked.data.current as Picked
    const target = over ? String(over.id).slice(dayId('').length) : undefined
    if (target && target !== day) move(row, day, target)
  }

  // A month's day with more events than it shows links to its week
  const more = (day: string, hidden: number) => {
    const to = calendarView({ scale: 'week', day }, now)
    const label = text('moreHidden', hidden)
    const className = 'self-start rounded px-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary'
    return linkTo ? (
      <AppLink to={linkTo(to)} className={className}>
        {label}
      </AppLink>
    ) : (
      <button type="button" className={className} onClick={() => setLocal(to)}>
        {label}
      </button>
    )
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <CalendarControls view={shown} now={now} linkTo={linkTo} onView={setLocal} />
      {list.error && <ErrorBanner title={text('couldNotLoadRows')} error={list.error} />}
      {list.capped && (
        <p className="text-xs text-muted-foreground">
          {text('capped', calendarLimit, shown.scale)}
        </p>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={start}
        onDragEnd={end}
        onDragCancel={release}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable: text('calendarInstructions'),
          },
        }}
      >
        {/* As tall as its fullest days, scrolling with the page */}
        <div className="overflow-hidden rounded-lg border border-border">
          {!week && (
            <div aria-hidden className="grid grid-cols-7 gap-px border-b border-border bg-border">
              {days.slice(0, 7).map((day) => (
                <span key={day} className="bg-surface px-1.5 py-1 text-xs font-medium text-muted-foreground">
                  {formatWeekday(Date.parse(`${day}T00:00:00Z`))}
                </span>
              ))}
            </div>
          )}
          <div className={cn('grid gap-px bg-border', week ? 'grid-cols-1 sm:grid-cols-7' : 'grid-cols-7')}>
            {days.map((day) => {
              const events = placed.get(day)!
              const visible = week ? events : events.slice(0, monthDayLimit)
              return (
                <CalendarDay
                  key={day}
                  day={day}
                  count={events.length}
                  inMonth={week || day.startsWith(shown.day.slice(0, 7))}
                  today={day === today}
                  week={week}
                  more={visible.length < events.length && more(day, events.length - visible.length)}
                >
                  {list.loading ? (
                    <Skeleton className="h-4" />
                  ) : (
                    visible.map((row) => (
                      <CalendarEvent
                        key={row.key}
                        model={model}
                        view={view}
                        display={display}
                        row={row}
                        day={day}
                        movable={movable && rowAllows(row.record, 'update')}
                        dragged={() => dragged.current}
                      />
                    ))
                  )}
                </CalendarDay>
              )
            })}
          </div>
        </div>
        <DragOverlay>{active && <EventChip model={model} view={view} display={display} row={active.row} day={active.day} />}</DragOverlay>
      </DndContext>
    </div>
  )
}
