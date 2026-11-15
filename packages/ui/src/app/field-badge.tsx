import type { ResourceModel, ViewModel } from '@protobase/schema'
import { displayValue } from '../live/display-value'
import { ValueBadge } from './value-badge'

/**
 * A record's value of `field` as a badge, in the words and colour its view gives the value, with the field's label for
 * screen readers; nothing for a field the model does not have or an empty value.
 */
export const FieldBadge = ({ model, view, field, record }: { model: ResourceModel; view: ViewModel | undefined; field: string; record: Record<string, unknown> }) => {
  const declared = model.fields[field]
  const value = record[field]
  if (!declared || value === null || value === undefined) return null
  const hints = view?.fields[field]
  return (
    <ValueBadge value={value} hints={hints}>
      <span className="sr-only">{hints?.label ?? field}: </span>
      {displayValue(declared, value, hints)}
    </ValueBadge>
  )
}
