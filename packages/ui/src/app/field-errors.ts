import { isApiError, type ProblemError } from '@protobase/client'
import type { FieldModel } from '@protobase/schema'
import { formatInt } from '../format'

type Params = ProblemError['params']

const numberIn = (params: Params, key: string) => (typeof params?.[key] === 'number' ? params[key] : undefined)

const characters = (count: number) => `${formatInt(count)} character${count === 1 ? '' : 's'}`

const textMessage = (label: string, params: Params) => {
  const min = numberIn(params, 'min')
  const max = numberIn(params, 'max')
  if (min !== undefined) return `${label} needs at least ${characters(min)}`
  if (max !== undefined) return `${label} can have at most ${characters(max)}`
  // A pattern's message is the project's own
  return undefined
}

const wholeNumber = (params: Params) => {
  const min = numberIn(params, 'min')
  const max = numberIn(params, 'max')
  if (min !== undefined) return `Enter a whole number of at least ${formatInt(min)}`
  if (max !== undefined) return `Enter a whole number of at most ${formatInt(max)}`
  return 'Enter a whole number'
}

const decimalMessage = (params: Params) => {
  const precision = numberIn(params, 'precision')
  const scale = numberIn(params, 'scale')
  if (precision === undefined || scale === undefined) return 'Enter a number'
  const below = formatInt(10 ** (precision - scale))
  return scale === 0 ? `Enter a whole number below ${below}` : `Enter a number with at most ${scale} decimal${scale === 1 ? '' : 's'}, below ${below}`
}

/** What to say about a value of each field type the server turned down; without an entry, the server's message shows. */
const invalidValue: Record<string, (label: string, params: Params) => string | undefined> = {
  text: textMessage,
  integer: (_, params) => wholeNumber(params),
  bigint: () => 'Enter a whole number',
  decimal: (_, params) => decimalMessage(params),
  date: () => 'Enter a date',
  timestamp: () => 'Enter a date and time',
  country: () => 'Enter a two-letter country code, such as NL',
  currency: () => 'Enter a three-letter currency code, such as EUR',
  uuid: () => 'Enter a valid ID',
  enum: () => 'Choose one of the options',
  relation: () => 'Choose a record',
  json: () => 'Enter valid JSON',
}

/**
 * The message a form shows under a field the server turned down, in the words of the field's label: "Country is
 * required", "Enter a number with at most 2 decimals". A `.validate()` rule's message and anything unknown show as the
 * server words them.
 */
export const fieldMessage = (field: FieldModel | undefined, label: string, error: ProblemError) => {
  if (error.code === 'required') return `${label} is required`
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
  const check = fields.size === 0 ? [] : [`Check ${fields.size === 1 ? 'the marked field' : `${fields.size} fields`}.`]
  return [...check, ...record].join(' ')
}
