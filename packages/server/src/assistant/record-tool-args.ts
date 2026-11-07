import { problemOf } from '../error-handler'
import type { RecordKeyInput } from './records'

/**
 * A refusal the model can act on (no such resource, not allowed, a bad filter, a record a database constraint rejects)
 * as `{ error, message }` JSON, as the REST API's problem words it; undefined for anything else.
 */
export const refusalOf = (error: unknown) => {
  const problem = problemOf(error)
  if (!problem || problem.status >= 500) return
  return JSON.stringify({ error: problem.slug, message: problem.detail })
}

/** A refusal the model can act on is its to read, as `refusalOf` words it; anything else fails the call. */
export const refused = (error: unknown) => {
  const refusal = refusalOf(error)
  if (refusal === undefined) throw error
  return refusal
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

export const filterParameter = {
  type: 'string',
  description: 'An AIP-160 filter on filterable fields, such as status = "open" AND amount > 10. related(field, resource.key, (subfilter)), ANDed with the rest, keeps the records whose field holds the key of a record of resource that meets the subfilter.',
}

export const keyParameter = {
  description: 'The record\'s key: its value, or the values of its key fields in order when the key has several.',
  anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'array', items: { type: ['string', 'number'] }, minItems: 1 }],
}

export const belongsToParameter = {
  type: 'object',
  properties: { resource: resourceParameter, key: keyParameter },
  required: ['resource', 'key'],
  description: 'Keeps to the records that belong to this record, by a relation or a declared link, such as { "resource": "objectives", "key": 40 } for an objective\'s tasks; filter then narrows them.',
}

/** `belongs_to` as a tool passes it on: nothing without it, undefined when it is no resource and single key. */
export const belongsToOf = (args: Record<string, unknown>) => {
  if (args.belongs_to === undefined) return {}
  if (typeof args.belongs_to !== 'object' || args.belongs_to === null) return undefined
  const { resource, key } = args.belongs_to as { resource?: unknown; key?: unknown }
  return typeof resource === 'string' && (typeof key === 'string' || typeof key === 'number') ? { belongs_to: { resource, key } } : undefined
}

export const invalidBelongsTo = JSON.stringify({ error: 'invalid-parameter', message: 'Invalid parameter belongs_to: pass { "resource": "<name>", "key": <its key> }' })

export const showDeletedParameter = { type: 'boolean', description: 'true also returns soft-deleted records; only on a resource list_resources marks soft_delete.' }
