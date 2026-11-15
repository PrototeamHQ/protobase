import type { ResourceModel, ViewModel } from '@protobase/schema'
import { formatDate, formatDateTime } from '../../../../format/date'
import { displayValue } from '../../../../live/display-value'
import { text } from '../../messages'
import type { TimelineBar, TimelineFields, TimelineSegment } from './timeline-layout'

const timeOf = (ms: number, dated: boolean) => (dated ? formatDate(ms) : formatDateTime(ms))

/** "14 Nov 2026, 09:00 – 14 Nov 2026, 11:30", or "… – now" while it runs: from `start` to `end`, in the type of `fields.start`. */
export const rangeText = (model: ResourceModel, fields: TimelineFields, start: number, end: number, open: boolean) => {
  const dated = model.fields[fields.start]?.type === 'date'
  return text('timelineRange', { from: timeOf(start, dated), to: open ? text('timelineNow') : timeOf(end, dated) })
}

/** A segment's value and times, as one line. */
export const segmentText = (segment: TimelineSegment, model: ResourceModel, view: ViewModel | undefined, fields: TimelineFields) =>
  `${displayValue(model.fields[fields.color]!, segment.value, view?.fields[fields.color])}: ${rangeText(model, fields, segment.start, segment.end, segment.open)}`

/** What a bar reads as to a screen reader: its name, its value as shown without one, and times, then each segment's. */
export const barText = (bar: TimelineBar, model: ResourceModel, view: ViewModel | undefined, fields: TimelineFields, known?: string) => {
  const open = bar.segments.some((segment) => segment.open && segment.end === bar.end)
  const name = known ?? displayValue(model.fields[fields.bar]!, bar.value, view?.fields[fields.bar])
  return [`${name}: ${rangeText(model, fields, bar.start, bar.end, open)}`, ...bar.segments.map((segment) => segmentText(segment, model, view, fields))].join('; ')
}
