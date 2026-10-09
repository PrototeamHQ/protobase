import type { ResourceModel, ViewModel } from '@protobase/schema'
import { displayValue } from '../../live/display-value'
import { humanize } from '../../live/naming'

export type FieldChange = { field: string; label: string; before: string; after: string }

const volatile = new Set(['updatedAt'])

/** The fields whose stored value differs between two reads of a record, for the "changed since you opened it" dialog. */
export const diffRecords = (model: ResourceModel, view: ViewModel | undefined, before: Record<string, unknown>, after: Record<string, unknown>): FieldChange[] =>
  Object.values(model.fields).flatMap((field) => {
    if (volatile.has(field.name) || JSON.stringify(before[field.name] ?? null) === JSON.stringify(after[field.name] ?? null)) return []
    const hints = view?.fields[field.name]
    return [{ field: field.name, label: hints?.label ?? humanize(field.name), before: displayValue(field, before[field.name], hints), after: displayValue(field, after[field.name], hints) }]
  })
