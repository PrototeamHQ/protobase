import { HttpProblem } from '../problem'
import type { RecordKeyInput } from './records'

/** A refusal the model can act on (no such resource, not allowed, a bad filter) is its to read; anything else fails the call. */
export const refused = (error: unknown) => {
  if (error instanceof HttpProblem && error.status < 500) return JSON.stringify({ error: error.slug, message: error.detail })
  throw error
}

export const resourceOf = (args: Record<string, unknown>) => (typeof args.resource === 'string' && args.resource ? args.resource : undefined)

export const keyOf = (value: unknown): RecordKeyInput | undefined => {
  if (typeof value === 'string' || typeof value === 'number') return value
  if (Array.isArray(value) && value.length > 0 && value.every((part) => typeof part === 'string' || typeof part === 'number')) return value
  return undefined
}

export const resourceParameter = { type: 'string', description: 'The resource\'s name, as list_resources gives it.' }

export const keyParameter = {
  description: 'The record\'s key: its value, or the values of its key fields in order when the key has several.',
  anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'array', items: { type: ['string', 'number'] }, minItems: 1 }],
}
