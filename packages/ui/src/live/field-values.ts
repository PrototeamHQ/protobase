import type { FieldModel } from '@protobase/schema'
import { localeDecimal, parseNumberText, type DecimalSeparator } from '../format/number-text'
import { fileDiffers, filePatchValue } from './file-values'

/** What the editor's text input holds for a stored value. */
export const toDraft = (value: unknown) => (value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value))

const textEdited = new Set(['text', 'integer', 'bigint', 'decimal', 'date', 'currency', 'country'])

export const isEditable = (field: FieldModel) => !field.readOnly && field.type !== 'json' && field.type !== 'uuid' && field.type !== 'timestamp' && field.type !== 'relation'

/** A field a record's form cannot leave empty: written through the API, never null and no boolean, which always holds a value. */
export const isRequiredOnEdit = (field: FieldModel) => !field.readOnly && !field.nullable && field.type !== 'boolean'

const numeric = new Set(['integer', 'bigint', 'decimal'])

// A number as typed in the browser's language, `12,50` or `1.234` in Dutch, as the API writes it; other text as it is,
// for the server to refuse
const numberText = (text: string, decimal: DecimalSeparator) => parseNumberText(text, decimal) ?? text

/**
 * The JSON value to send for an edited field: integers become numbers, empty optional fields become null, and numbers
 * typed with the `decimal` separator of the browser's language are read as such.
 */
export const toPatchValue = (field: FieldModel, draft: unknown, decimal = localeDecimal()) => {
  if (field.type === 'boolean') return Boolean(draft)
  if (field.type === 'file') return filePatchValue(draft)
  const typed = String(draft).trim()
  if (typed === '') return field.nullable ? null : ''
  const text = numeric.has(field.type) ? numberText(typed, decimal) : typed
  if (field.type === 'integer') return Number(text)
  // A relation holds the other record's key, a number when that key is one
  if (field.type === 'relation') return typeof draft === 'number' ? draft : text
  if (textEdited.has(field.type) || field.type === 'enum') return text
  throw new Error(`Not implemented: editing ${field.type} fields`)
}

/** The value a draft stands for, as the API gives one: null when empty, a boolean or number where the field holds one. */
export const fromDraft = (field: FieldModel, draft: unknown, decimal = localeDecimal()) => {
  if (field.type === 'boolean') return Boolean(draft)
  if (String(draft ?? '').trim() === '') return null
  return toPatchValue(field, draft, decimal)
}

/** The draft for a value, as the editor holds it: a boolean for a boolean field, else its text. */
export const toFieldDraft = (field: FieldModel, value: unknown) => (field.type === 'boolean' ? Boolean(value) : toDraft(value))

/** Whether the draft differs from what the server holds, comparing numbers by value, as typed with `decimal`. */
export const differs = (field: FieldModel, draft: unknown, stored: unknown, decimal = localeDecimal()) => {
  if (field.type === 'boolean') return Boolean(draft) !== Boolean(stored)
  if (field.type === 'file') return fileDiffers(draft, stored)
  const a = String(draft ?? '').trim()
  const b = toDraft(stored)
  if (field.type === 'decimal' || field.type === 'integer') return a === '' || b === '' ? a !== b : Number(numberText(a, decimal)) !== Number(b)
  return a !== b
}
