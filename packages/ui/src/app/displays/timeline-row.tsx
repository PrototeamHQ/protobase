import type { ResourceModel, ViewModel } from '@protobase/schema'
import { cn } from '../../lib/cn'
import { CalendarEvent, eventTitle } from './calendar-event'
import type { ListDisplayRow } from './list-displays'
import { barOf, type TimelineDisplayModel } from './timeline-range'
import { share, timelineGrid } from './timeline-scale'

type RowProps = {
  model: ResourceModel
  view: ViewModel | undefined
  display: TimelineDisplayModel
  row: ListDisplayRow
  days: string[]
  movable: boolean
  dragged: () => boolean
}

/**
 * A record of a timeline: its title, and its bar over the days it is on, an event chip as wide as those days, cut
 * square where it goes on before or after them. The bar is the link to the record, and is picked up to move it.
 */
export const TimelineRow = ({ model, view, display, row, days, movable, dragged }: RowProps) => {
  const bar = barOf(row.record, display, model, days)
  return (
    <div className={cn(timelineGrid, 'relative border-b border-border last:border-b-0')}>
      {/* The bar's link says the title to assistive technology */}
      <span aria-hidden className="truncate px-2 pt-1 text-xs sm:py-1.5">
        {eventTitle(model, view, display, row)}
      </span>
      <div className="relative h-7">
        {bar && (
          <div className="absolute top-1/2 -translate-y-1/2" style={{ left: share(bar.first, days.length), width: share(bar.last - bar.first + 1, days.length) }}>
            <CalendarEvent
              model={model}
              view={view}
              display={display}
              row={row}
              day={bar.start}
              movable={movable}
              dragged={dragged}
              className={cn(bar.before && 'rounded-l-none border-l-0', bar.after && 'rounded-r-none border-r-0')}
            />
          </div>
        )}
      </div>
    </div>
  )
}
