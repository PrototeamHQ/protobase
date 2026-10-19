import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, type Announcements, type DragEndEvent, type DragMoveEvent, type DragStartEvent, type KeyboardCoordinateGetter, type Modifier } from '@dnd-kit/core'
import { useRef, useState } from 'react'
import type { AppAddress, ResourceModel, TimelineView, ViewModel } from '@protobase/schema'
import { formatDate } from '../../format/date'
import { dayIn, viewerZone } from '../../format/zone'
import { humanize } from '../../live/naming'
import { Skeleton } from '../../primitives/skeleton'
import { ErrorBanner } from '../error-banner'
import { usePermissions } from '../meta-gate'
import { can, rowAllows } from '../permissions'
import { addDays, inStartOrder, recordDays } from './calendar-range'
import { EventChip, eventTitle } from './calendar-event'
import type { ListDisplayRow } from './list-displays'
import { PeriodControls } from './period-controls'
import { scaledTimeline, stepTimeline, timelineDays, timelineHeading, timelineLanes, timelineRange, timelineTicks, timelineView, type TimelineDisplayModel } from './timeline-range'
import { TimelineRow } from './timeline-row'
import { TimelineLines, TimelineScale } from './timeline-scale'
import { calendarLimit, useCalendarRows } from './use-calendar-rows'
import { movedRows, useCalendarMove } from './use-calendar-move'

type TimelineProps = {
  model: ResourceModel
  view: ViewModel | undefined
  display: TimelineDisplayModel
  /** The fields the bars and lanes show, which the records' relations are labelled for. */
  fields: string[]
  /** The list's filter, its search included, as the list API takes it. */
  filter: string
  /** The period the address names; the month of today when it names none. */
  at?: TimelineView
  /** The address that shows the timeline at a period, for a timeline whose period is in the address; else it keeps its own. */
  linkTo?: (view: TimelineView) => AppAddress
  /** The time that is today, now unless a test fixes it. */
  now?: number
}

const scales: Array<{ scale: TimelineView['scale']; label: string }> = [
  { scale: 'week', label: 'Week' },
  { scale: 'month', label: 'Month' },
  { scale: 'quarter', label: 'Quarter' },
]

// What a bar being moved is: the record, and the day it starts on
type Picked = { row: ListDisplayRow; day: string }

/**
 * The list's records as bars over the days of a week, a month or a quarter, in lanes by the display's `group`, loaded
 * for those days alone through the list API as a calendar's are; a bar dragged along its row, or moved with the
 * keyboard, saves the record with its dates moved by the same days.
 */
export const TimelineDisplay = ({ model, view, display, fields, filter, at, linkTo, now = Date.now() }: TimelineProps) => {
  const [local, setLocal] = useState<TimelineView | undefined>()
  const shown = timelineView(linkTo ? at : local, now)
  const days = timelineDays(shown)
  const ticks = timelineTicks(shown)
  const list = useCalendarRows({ model, display, range: timelineRange(shown), fields, filter })
  const { moves, move } = useCalendarMove(model, display)
  const lanes = timelineLanes(inStartOrder(movedRows(list.rows, moves), display), model, view, display)
  const permissions = usePermissions(model.name)
  const movable = can(permissions, 'update') && [display.start, display.end].every((name) => name === undefined || !model.fields[name]?.readOnly)
  const [active, setActive] = useState<Picked | undefined>()
  // The click that ends a drag with a mouse lands on the bar's link, which must not open the record
  const dragged = useRef(false)
  // How many days the bar being moved has gone, for what is announced
  const shift = useRef(0)
  const track = useRef<HTMLDivElement>(null)
  const dayWidth = () => (track.current?.getBoundingClientRect().width ?? 0) / days.length
  const daysAcross = (x: number) => {
    const width = dayWidth()
    return width > 0 ? Math.round(x / width) : 0
  }
  // A bar moves along its row alone, a whole day at a time
  const snap: Modifier = ({ transform }) => ({ ...transform, x: daysAcross(transform.x) * dayWidth(), y: 0 })
  const dayKeys: KeyboardCoordinateGetter = (event, { currentCoordinates }) => {
    const step = event.code === 'ArrowLeft' ? -1 : event.code === 'ArrowRight' ? 1 : 0
    if (step === 0) return undefined
    event.preventDefault()
    return { x: currentCoordinates.x + step * dayWidth(), y: currentCoordinates.y }
  }
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    // Enter opens the bar's record, so only Space picks a bar up
    useSensor(KeyboardSensor, { keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] }, coordinateGetter: dayKeys }),
  )

  const today = dayIn(now, viewerZone())
  const title = (picked: Picked) => eventTitle(model, view, display, picked.row)
  const startText = (picked: Picked) => formatDate(Date.parse(`${addDays(picked.day, shift.current)}T00:00:00Z`))
  const announcements: Announcements = {
    onDragStart: ({ active: picked }) => `Picked up ${title(picked.data.current as Picked)}.`,
    onDragMove: ({ active: picked }) => `${title(picked.data.current as Picked)} starts on ${startText(picked.data.current as Picked)}.`,
    onDragOver: () => undefined,
    onDragEnd: ({ active: picked }) => (shift.current === 0 ? `${title(picked.data.current as Picked)} was put back.` : `${title(picked.data.current as Picked)} was moved to ${startText(picked.data.current as Picked)}.`),
    onDragCancel: ({ active: picked }) => `Moving ${title(picked.data.current as Picked)} was cancelled.`,
  }
  const release = () => {
    setActive(undefined)
    setTimeout(() => (dragged.current = false))
  }
  const start = ({ active: picked }: DragStartEvent) => {
    dragged.current = true
    shift.current = 0
    setActive(picked.data.current as Picked)
  }
  const moving = ({ delta }: DragMoveEvent) => (shift.current = daysAcross(delta.x))
  const end = ({ active: picked, delta }: DragEndEvent) => {
    release()
    shift.current = daysAcross(delta.x)
    const { row } = picked.data.current as Picked
    const span = recordDays(row.record, display, model)
    if (span && shift.current !== 0) move(row, span.first, addDays(span.first, shift.current))
  }

  const groupLabel = display.group === undefined ? (view?.names?.plural ?? humanize(model.name)) : (view?.fields[display.group]?.label ?? humanize(display.group))
  const empty = !list.loading && !list.error && list.rows.length === 0
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <PeriodControls
        heading={timelineHeading(shown)}
        unit={shown.scale}
        previous={stepTimeline(shown, -1)}
        today={timelineView({ scale: shown.scale, day: today }, now)}
        next={stepTimeline(shown, 1)}
        scales={scales.map(({ scale, label }) => ({ view: scaledTimeline(shown, scale, now), label, current: shown.scale === scale }))}
        scalesLabel="Timeline scale"
        linkTo={linkTo}
        onView={setLocal}
      />
      {list.error && <ErrorBanner title="Could not load rows" error={list.error} />}
      {list.capped && (
        <p className="text-xs text-muted-foreground">
          Showing the first {calendarLimit} records of this {shown.scale}. Narrow the filter to see the rest.
        </p>
      )}
      <DndContext
        sensors={sensors}
        modifiers={[snap]}
        onDragStart={start}
        onDragMove={moving}
        onDragEnd={end}
        onDragCancel={release}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable: 'To move a bar to other days, press Space, move it a day with the left and right arrow keys, and press Space again to drop it there. Escape puts it back.',
          },
        }}
      >
        {/* As tall as all its rows, scrolling with the page */}
        <div className="overflow-hidden rounded-lg border border-border">
          <TimelineScale ticks={ticks} days={days} today={today} label={groupLabel} trackRef={track} />
          <div className="relative">
            <TimelineLines ticks={ticks} days={days} today={today} />
            {list.loading && (
              <div className="relative flex flex-col gap-2 p-2">
                <Skeleton className="h-4" />
                <Skeleton className="h-4" />
              </div>
            )}
            {empty && <p className="relative px-2 py-3 text-xs text-muted-foreground">Nothing in this {shown.scale}.</p>}
            {!list.loading &&
              lanes.map((lane) => (
                <section key={lane.key} aria-label={lane.label} className="relative border-b border-border last:border-b-0">
                  {lane.label !== undefined && (
                    <h3 className="flex items-center gap-1.5 border-b border-border bg-surface px-2 py-1 text-xs font-medium">
                      {lane.label}
                      <span className="tabular-nums text-muted-foreground">{lane.rows.length}</span>
                    </h3>
                  )}
                  {lane.rows.map((row) => (
                    <TimelineRow key={row.key} model={model} view={view} display={display} row={row} days={days} movable={movable && rowAllows(row.record, 'update')} dragged={() => dragged.current} />
                  ))}
                </section>
              ))}
          </div>
        </div>
        <DragOverlay>{active && <EventChip model={model} view={view} display={display} row={active.row} day={active.day} />}</DragOverlay>
      </DndContext>
    </div>
  )
}
