import type { FieldModel, FieldViewModel } from '@protobase/schema'
import { cn } from '../../../../lib/cn'
import { withinBar, type TimelineBar } from './timeline-layout'
import { segmentPaint, stripes, type SegmentPaint } from './timeline-paint'

/** A swatch or segment's fill: its tone's class or colour, with stripes while it waits. */
export const paintStyle = (paint: SegmentPaint) => ({ ...(paint.color !== undefined && { backgroundColor: paint.color }), ...(paint.striped && { backgroundImage: stripes }) })

/** A bar's segments, each where its time falls in the bar and filled as its `color` value says. */
export const SegmentFill = ({ bar, field, hints }: { bar: TimelineBar; field: FieldModel; hints: FieldViewModel | undefined }) =>
  bar.segments.map((segment, index) => {
    const paint = segmentPaint(field, hints, segment.value)
    const { left, width } = withinBar(bar, segment)
    return <span key={index} aria-hidden="true" className={cn('absolute inset-y-0', paint.className)} style={{ left: `${left}%`, width: `${width}%`, ...paintStyle(paint) }} />
  })
