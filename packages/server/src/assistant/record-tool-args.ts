import { QueryError } from '@protobase/query'
import { queryProblem } from '../error-handler'
import { HttpProblem } from '../problem'
import type { RecordKeyInput } from './records'

/** A refusal the model can act on (no such resource, not allowed, a bad filter) is its to read; anything else fails the call. */
export const refused = (error: unknown) => {
  const problem = error instanceof QueryError ? queryProblem(error) : error
  if (problem instanceof HttpProblem && problem.status < 500) return JSON.stringify({ error: problem.slug, message: problem.detail })
  throw error
}

/** `show_deleted` as JSON `true` or `false`, absent being `false`; undefined for any other value, such as `"true"` or `1`. */
export const showDeletedOf = (args: Record<string, unknown>) => {
  if (args.show_deleted === undefined) return false
  return typeof args.show_deleted === 'boolean' ? args.show_deleted : undefined
}

export const invalidShowDeleted = JSON.stringify({ error: 'invalid-parameter', message: 'Invalid parameter show_deleted: pass true or false' })

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

export const showDeletedParameter = { type: 'boolean', description: 'true also returns soft-deleted records; only on a resource list_resources marks soft_delete.' }
