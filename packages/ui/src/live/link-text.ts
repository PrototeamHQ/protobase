import type { ResourceModel, ViewModel } from '@protobase/schema'
import { fillText } from '@protobase/schema/internal'
import { relationLabel } from '../data-grid/cell-text'
import { displayValue } from './display-value'

// A field's value as the text of a link names it: as the record page shows it, an empty one as nothing at all.
const shownText = (model: ResourceModel, view: ViewModel | undefined, name: string, value: unknown) => {
  const field = model.fields[name]
  if (value === null || value === undefined || value === '') return ''
  if (!field) return String(value)
  return field.type === 'relation' ? relationLabel(value) : displayValue(field, value, view?.fields[name])
}

/**
 * The text a url field's link shows on `record` instead of its address, from the view's link text with each `{field}`
 * as the record page shows it; nothing without link text or when it comes out empty, so the address shows.
 */
export const linkTextOf = (model: ResourceModel, view: ViewModel | undefined, name: string, record: Record<string, unknown>) => {
  const template = view?.fields[name]?.linkText
  if (template === undefined) return
  const text = fillText(template, (other) => shownText(model, view, other, record[other])).trim()
  return text === '' ? undefined : text
}
