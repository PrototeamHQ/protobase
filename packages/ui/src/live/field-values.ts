import type { FieldModel } from '@protobase/schema'
import { fileDiffers, filePatchValue } from './file-values'

/** What the editor's text input holds for a stored value. */
export const toDraft = (value: unknown) => (value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value))

const textEdited = new Set(['text', 'integer', 'bigint', 'decimal', 'date', 'currency', 'country'])

export const isEditable = (field: FieldModel) => !field.readOnly && field.type !== 'json' && field.type !== 'uuid' && field.type !== 'timestamp' && field.type !== 'relation'

/** The JSON value to send for an edited field: integers become numbers, empty optional fields become null. */
export const toPatchValue = (field: FieldModel, draft: unknown) => {
  if (field.type === 'boolean') return Boolean(draft)
  if (field.type === 'file') return filePatchValue(draft)
  const text = String(draft).trim()
  if (text === '') return field.nullable ? null : ''
  if (field.type === 'integer') return Number(text)
  if (textEdited.has(field.type) || field.type === 'enum') return text
  throw new Error(`Not implemented: editing ${field.type} fields`)
}

/** The value a draft stands for, as the API gives one: null when empty, a boolean or number where the field holds one. */
export const fromDraft = (field: FieldModel, draft: unknown) => {
  if (field.type === 'boolean') return Boolean(draft)
  if (String(draft ?? '').trim() === '') return null
  return toPatchValue(field, draft)
}

/** The draft for a value, as the editor holds it: a boolean for a boolean field, else its text. */
export const toFieldDraft = (field: FieldModel, value: unknown) => (field.type === 'boolean' ? Boolean(value) : toDraft(value))

/** Whether the draft differs from what the server holds, comparing numbers by value. */
export const differs = (field: FieldModel, draft: unknown, stored: unknown) => {
  if (field.type === 'boolean') return Boolean(draft) !== Boolean(stored)
  if (field.type === 'file') return fileDiffers(draft, stored)
  const a = String(draft ?? '').trim()
  const b = toDraft(stored)
  if (field.type === 'decimal' || field.type === 'integer') return a === '' || b === '' ? a !== b : Number(a) !== Number(b)
  return a !== b
}
