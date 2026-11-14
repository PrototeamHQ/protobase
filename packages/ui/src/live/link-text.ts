import type { ResourceModel, ViewModel } from '@protobase/schema'
import { fillText, textPlaceholders } from '@protobase/schema/internal'
import { relationLabel } from '../data-grid/cell-text'
import { displayValue } from './display-value'

const isEmpty = (value: unknown) => value === null || value === undefined || value === ''

// A field's value as the text of a link names it, as the record page shows it: a relation by the name resolved for it, else as the row carries it.
const shownText = (model: ResourceModel, view: ViewModel | undefined, name: string, value: unknown, labels: RelationLabels) => {
  const field = model.fields[name]
  if (!field) return String(value)
  return field.type === 'relation' ? (labels[name] ?? relationLabel(value)) : displayValue(field, value, view?.fields[name])
}

/** Per relation field, the name of the record it points at, where it is already resolved. */
export type RelationLabels = Readonly<Record<string, string | undefined>>

/**
 * The text a url field's link shows on `record` instead of its address, from the view's link text with each `{{field}}`
 * as the record page shows it, a relation by its name in `labels` when resolved there; nothing without link text or when a field it names is empty, so the address shows
 * rather than a text with a gap, such as `Crash on save ()`.
 */
export const linkTextOf = (model: ResourceModel, view: ViewModel | undefined, name: string, record: Record<string, unknown>, labels: RelationLabels = {}) => {
  const template = view?.fields[name]?.linkText
  if (template === undefined || textPlaceholders(template).some((other) => isEmpty(record[other]))) return
  const text = fillText(template, (other) => shownText(model, view, other, record[other], labels)).trim()
  return text === '' ? undefined : text
}
