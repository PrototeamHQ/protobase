import type { ResourceModel, ViewModel } from '@protobase/schema'
import { displayValue } from '../../../../live/display-value'
import { FieldValue } from '../../field-value'
import { text } from '../../messages'
import { paintStyle } from './segment-fill'
import type { TimelineBar, TimelineFields } from './timeline-layout'
import { segmentPaint } from './timeline-paint'
import { rangeText } from './timeline-text'
import { cn } from '../../../../lib/cn'

type ReadoutProps = { bar: TimelineBar | null; model: ResourceModel; view: ViewModel | undefined; fields: TimelineFields }

/** A value's colour, as a small square beside its name. */
const Swatch = ({ model, view, fields, value }: Omit<ReadoutProps, 'bar'> & { value: unknown }) => {
  const paint = segmentPaint(model.fields[fields.color]!, view?.fields[fields.color], value)
  return <span aria-hidden="true" className={cn('inline-block size-3 shrink-0 rounded-sm', paint.className)} style={paintStyle(paint)} />
}

/** What each colour of a bar means: the `color` field's values the bars hold, in the enum's order, the waits striped. */
export const TimelineLegend = ({ values, ...props }: Omit<ReadoutProps, 'bar'> & { values: ReadonlySet<string> }) => {
  const field = props.model.fields[props.fields.color]!
  const shown = (field.enumValues ?? []).filter((value) => values.has(value))
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {shown.map((value) => (
        <li key={value} className="flex items-center gap-1.5">
          <Swatch {...props} value={value} />
          {displayValue(field, value, props.view?.fields[props.fields.color])}
        </li>
      ))}
    </ul>
  )
}

/** The bar pointed at: its value and times, then each segment's value and times; a hint while none is. */
export const TimelineReadout = ({ bar, ...props }: ReadoutProps) => {
  const { model, view, fields } = props
  if (!bar) return <p className="text-sm text-muted-foreground">{text('timelinePoint')}</p>
  const open = bar.segments.some((segment) => segment.open && segment.end === bar.end)
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">
          <FieldValue model={model} field={model.fields[fields.bar]!} value={bar.value} />
        </span>
        <span className="text-muted-foreground tabular-nums">{rangeText(model, fields, bar.start, bar.end, open)}</span>
      </p>
      <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
        {bar.segments.map((segment, index) => (
          <li key={index} className="flex items-center gap-1.5 tabular-nums">
            <Swatch {...props} value={segment.value} />
            {displayValue(model.fields[fields.color]!, segment.value, view?.fields[fields.color])}: {rangeText(model, fields, segment.start, segment.end, segment.open)}
          </li>
        ))}
      </ul>
    </div>
  )
}
