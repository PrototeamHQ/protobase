import { useDraggable } from '@dnd-kit/core'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { formatTime } from '../../format/date'
import { dayIn, viewerZone } from '../../format/zone'
import { cn } from '../../lib/cn'
import { displayValue } from '../../live/display-value'
import { recordTitleField } from '../../live/model-helpers'
import { useSeedRecord } from '../record-preview'
import { AppLink } from '../use-app-address'
import type { DatedDisplay } from './calendar-range'
import { eventId } from './calendar-dnd'
import type { ListDisplayRow } from './list-displays'

type EventProps = {
  model: ResourceModel
  view: ViewModel | undefined
  display: DatedDisplay
  row: ListDisplayRow
  /** The day it is shown on, which starts with its time when it starts that day at a time. */
  day: string
  /** Classes on the chip, such as a timeline bar's edges. */
  className?: string
}

/** The text an event shows: its `title` field, or the view's title, with the names of the records relations point at. */
export const eventTitle = (model: ResourceModel, view: ViewModel | undefined, display: DatedDisplay, row: ListDisplayRow) => {
  const name = display.title ?? recordTitleField(model, view)
  const field = model.fields[name]
  const text = row.labels[name] ?? (field ? displayValue(field, row.record[name], view?.fields[name]) : '')
  return text === '' ? row.key : text
}

// A timestamp event's time on the day it starts, both on the viewer's clock
const startTime = (model: ResourceModel, display: DatedDisplay, row: ListDisplayRow, day: string) => {
  const value = row.record[display.start]
  if (model.fields[display.start]?.type !== 'timestamp' || typeof value !== 'string') return undefined
  const ms = Date.parse(value)
  return dayIn(ms, viewerZone()) === day ? formatTime(ms) : undefined
}

/** An event as a one-line link to its record, its time first for a timestamp, styled as a small record card. */
export const EventChip = ({ model, view, display, row, day, className }: EventProps) => {
  const seedRecord = useSeedRecord(model)
  const time = startTime(model, display, row, day)
  return (
    <AppLink
      to={{ kind: 'record', resource: model.name, key: row.key }}
      onClick={() => seedRecord(row.record)}
      className={cn(
        'flex min-w-0 items-baseline gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-xs hover:border-border-strong hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
        className,
      )}
    >
      {time && <span className="shrink-0 tabular-nums text-muted-foreground">{time}</span>}
      <span className="min-w-0 truncate">{eventTitle(model, view, display, row)}</span>
    </AppLink>
  )
}

/** An event on one of its days, picked up by dragging it or by Space on its link; one the user may not update stays put. */
export const CalendarEvent = ({ movable, dragged, ...props }: EventProps & { movable: boolean; dragged: () => boolean }) => {
  const { setNodeRef, setActivatorNodeRef, listeners, isDragging } = useDraggable({ id: eventId(props.row.key, props.day), data: { row: props.row, day: props.day }, disabled: !movable })
  return (
    <div
      ref={(element) => {
        setNodeRef(element)
        // Space picks the event up from its link, which has the focus
        setActivatorNodeRef(element?.querySelector('a') ?? element)
      }}
      {...listeners}
      // The event is a link, which the browser would drag as one
      onDragStart={(event) => event.preventDefault()}
      onClickCapture={(event) => {
        if (!dragged()) return
        event.preventDefault()
        event.stopPropagation()
      }}
      className={cn('min-w-0', movable && 'cursor-grab touch-manipulation', isDragging && 'opacity-40')}
    >
      <EventChip {...props} />
    </div>
  )
}
