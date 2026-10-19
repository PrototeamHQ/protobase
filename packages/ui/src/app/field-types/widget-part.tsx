import type { ReactNode } from 'react'
import type { FieldModel } from '@protobase/schema'
import { CustomBoundary } from '../pages/custom-boundary'
import type { ShownWidget } from './shown-widget'
import { text } from './messages'

type WidgetPartProps = {
  shown: ShownWidget
  part: 'display' | 'cell' | 'editor'
  field: FieldModel
  value: unknown
  /** The built-in rendering: drawn when the field type has no such part, and when it throws. */
  fallback: ReactNode
  onChange?: (value: unknown) => void
  invalid?: boolean
}

// The part's element, or undefined when the field type has no such part.
const partOf = ({ shown, part, field, value, onChange, invalid = false }: Omit<WidgetPartProps, 'fallback'>) => {
  const { widget, props } = shown
  const shared = { field, value: value ?? null, props }
  if (part !== 'editor') {
    const Show = part === 'cell' ? (widget.cell ?? widget.display) : widget.display
    return <Show {...shared} />
  }
  const Editor = widget.editor
  return Editor && onChange ? <Editor {...shared} onChange={onChange} invalid={invalid} /> : undefined
}

/** One part of a field type for a field, inside a boundary that draws the built-in rendering instead when it throws. */
export const WidgetPart = ({ fallback, ...rest }: WidgetPartProps) => {
  const element = partOf(rest)
  if (!element) return fallback
  return (
    <CustomBoundary name={text('fieldType', rest.shown.name)} fallback={fallback}>
      {element}
    </CustomBoundary>
  )
}
