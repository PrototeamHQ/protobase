import type { ResourceModel, ViewModel } from '@protobase/schema'
import { fillText, textPlaceholders } from '@protobase/schema/internal'
import { relationLabel } from '../data-grid/cell-text'
import { displayValue } from './display-value'

const isEmpty = (value: unknown) => value === null || value === undefined || value === ''

// A field's value as the text of a link names it, as the record page shows it.
const shownText = (model: ResourceModel, view: ViewModel | undefined, name: string, value: unknown) => {
  const field = model.fields[name]
  if (!field) return String(value)
  return field.type === 'relation' ? relationLabel(value) : displayValue(field, value, view?.fields[name])
}

/**
 * The text a url field's link shows on `record` instead of its address, from the view's link text with each `{field}`
 * as the record page shows it; nothing without link text or when a field it names is empty, so the address shows
 * rather than a text with a gap, such as `Crash on save ()`.
 */
export const linkTextOf = (model: ResourceModel, view: ViewModel | undefined, name: string, record: Record<string, unknown>) => {
  const template = view?.fields[name]?.linkText
  if (template === undefined || textPlaceholders(template).some((other) => isEmpty(record[other]))) return
  const text = fillText(template, (other) => shownText(model, view, other, record[other])).trim()
  return text === '' ? undefined : text
}
