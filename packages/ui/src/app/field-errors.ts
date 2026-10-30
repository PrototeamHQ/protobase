import { isApiError, type ProblemError } from '@protobase/client'
import type { FieldModel } from '@protobase/schema'
import { formatInt } from '../format'
import { text } from './field-messages'

type Params = ProblemError['params']

const numberIn = (params: Params, key: string) => (typeof params?.[key] === 'number' ? params[key] : undefined)

const textMessage = (label: string, params: Params) => {
  const min = numberIn(params, 'min')
  const max = numberIn(params, 'max')
  if (min !== undefined) return text('atLeastCharacters', { label, count: formatInt(min), n: min })
  if (max !== undefined) return text('atMostCharacters', { label, count: formatInt(max), n: max })
  // A pattern's message is the project's own
  return undefined
}

const wholeNumber = (params: Params) => {
  const min = numberIn(params, 'min')
  const max = numberIn(params, 'max')
  if (min !== undefined) return text('wholeNumberAtLeast', { min: formatInt(min) })
  if (max !== undefined) return text('wholeNumberAtMost', { max: formatInt(max) })
  return text('wholeNumber')
}

const decimalMessage = (params: Params) => {
  const precision = numberIn(params, 'precision')
  const scale = numberIn(params, 'scale')
  if (precision === undefined || scale === undefined) return text('number')
  const below = formatInt(10 ** (precision - scale))
  return scale === 0 ? text('wholeNumberBelow', { below }) : text('decimalsBelow', { scale, below })
}

/** What to say about a value of each field type the server turned down; without an entry, the server's message shows. */
const invalidValue: Record<string, (label: string, params: Params) => string | undefined> = {
  text: textMessage,
  integer: (_, params) => wholeNumber(params),
  bigint: () => text('wholeNumber'),
  decimal: (_, params) => decimalMessage(params),
  date: () => text('date'),
  timestamp: () => text('timestamp'),
  country: () => text('country'),
  currency: () => text('currency'),
  uuid: () => text('uuid'),
  enum: () => text('enum'),
  relation: () => text('relation'),
  json: () => text('json'),
}

/**
 * The message a form shows under a field the server turned down, in the words of the field's label: "Country is
 * required", "Enter a number with at most 2 decimals". A `.validate()` rule's message and anything unknown show as the
 * server words them.
 */
export const fieldMessage = (field: FieldModel | undefined, label: string, error: ProblemError) => {
  if (error.code === 'required') return text('required', { label })
  if (error.code !== 'invalid-value' || !field) return error.message
  return invalidValue[field.type]?.(label, error.params) ?? error.message
}

/** The first problem with each field in an API error, by field name; none for any other error, nor for a rule about the whole record. */
export const fieldErrors = (error: unknown): Record<string, ProblemError> => {
  if (!isApiError(error)) return {}
  const found: Record<string, ProblemError> = {}
  for (const entry of error.errors) if (entry.field && entry.field !== '_record' && !Object.hasOwn(found, entry.field)) found[entry.field] = entry
  return found
}

/**
 * What a save's toast says about an API error: how many fields to check when the fields show what is wrong, besides
 * the messages of rules about the whole record; the error's own message otherwise.
 */
export const saveFailureDescription = (error: { message: string; errors: ProblemError[]; operation?: number }) => {
  if (error.operation !== undefined) return error.message
  const fields = new Set(error.errors.flatMap((entry) => (entry.field && entry.field !== '_record' ? [entry.field] : [])))
  const record = error.errors.flatMap((entry) => (entry.field === '_record' ? [entry.message] : []))
  if (fields.size === 0 && record.length === 0) return error.message
  const check = fields.size === 0 ? [] : [fields.size === 1 ? text('checkField') : text('checkFields', { count: fields.size })]
  return [...check, ...record].join(' ')
}
