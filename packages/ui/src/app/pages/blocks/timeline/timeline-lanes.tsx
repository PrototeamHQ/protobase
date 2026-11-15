import type { ResourceModel, ViewModel } from '@protobase/schema'
import { cn } from '../../../../lib/cn'
import { RouteLink, type RouteTarget } from '../../../../primitives/route-link'
import { FieldValue } from '../../field-value'
import type { TimelineBar, TimelineFields, TimelineShape } from './timeline-layout'
import { TimelineAxis } from './timeline-axis'
import { SegmentFill } from './segment-fill'
import { barText } from './timeline-text'

/** What the lanes draw with: the resource and its view, the fields by role, and what pointing at and choosing a bar do. */
export type LanesProps = {
  shape: TimelineShape
  model: ResourceModel
  view: ViewModel | undefined
  fields: TimelineFields
  onPoint: (bar: TimelineBar | null) => void
  /** With `select`: where a bar leads, and the key of the bar chosen. */
  choose?: { barTo: (key: string) => RouteTarget; chosen: string | undefined }
}

const barLook = 'absolute inset-y-0 flex overflow-hidden rounded-sm ring-offset-1 ring-offset-background outline-none hover:ring-2 hover:ring-border-strong focus-visible:ring-2 focus-visible:ring-primary'

// One bar: its segments side by side within it, a link to the page with it chosen under `select`, else a mark that
// can take focus, so a keyboard and a screen reader reach its times too
const BarMark = ({ bar, model, view, fields, onPoint, choose }: Omit<LanesProps, 'shape'> & { bar: TimelineBar }) => {
  const label = barText(bar, model, view, fields)
  const point = { onMouseEnter: () => onPoint(bar), onMouseLeave: () => onPoint(null), onFocus: () => onPoint(bar), onBlur: () => onPoint(null) }
  const style = { left: `${bar.left}%`, width: `max(${bar.width}%, 4px)` }
  const segments = <SegmentFill bar={bar} field={model.fields[fields.color]!} hints={view?.fields[fields.color]} />
  if (!choose) {
    return (
      <span role="img" tabIndex={0} aria-label={label} style={style} className={barLook} {...point}>
        {segments}
      </span>
    )
  }
  const chosen = choose.chosen === bar.key
  return (
    <RouteLink to={choose.barTo(bar.key)} aria-label={label} aria-current={chosen ? 'true' : undefined} style={style} className={cn(barLook, chosen && 'ring-2 ring-foreground')} {...point}>
      {segments}
    </RouteLink>
  )
}

/**
 * A lane per value of `lane`, its name beside its bars from a phone's width up and above them on a phone, its bars in
 * as many rows as keep them apart in time, under an axis of the whole time. The bars are placed as a share of the
 * width, so the timeline always fits the page and never scrolls sideways.
 */
export const TimelineLanes = ({ shape, ...props }: LanesProps) => {
  const { model, fields } = props
  const laneField = model.fields[fields.lane]!
  return (
    <div className="flex flex-col gap-2">
      <div className="flex sm:pl-40">
        <TimelineAxis from={shape.from} to={shape.to} />
      </div>
      <ul className="flex flex-col gap-3 sm:gap-2">
        {shape.lanes.map((lane) => (
          <li key={lane.key} className="flex flex-col gap-1 sm:flex-row sm:items-center">
            <div className="min-w-0 truncate text-sm font-medium sm:w-40 sm:shrink-0 sm:pr-3">
              <FieldValue model={model} field={laneField} value={lane.value} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1 border-l border-border pl-px">
              {lane.rows.map((row, index) => (
                <div key={index} className="relative h-6 overflow-x-clip">
                  {row.map((bar) => (
                    <BarMark key={bar.key} bar={bar} {...props} />
                  ))}
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
