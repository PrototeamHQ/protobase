import type { ResourceModel } from '@protobase/schema'
import type { ResourceChange } from '../changes/resource-change'
import { equalityKeys, mayMatch, type Condition } from './condition'

/** A read some derived value's record depends on, as the database keeps it. */
export type StoredRead = { name: string; key: string; resource: string; condition: Condition; fields: string[] | null }

export const fieldTypes = (model: ResourceModel) => Object.fromEntries(Object.values(model.fields).map((field) => [field.name, field.type]))

/**
 * Whether a change touches a read: the record before or after it may meet the read's condition, so a record that comes
 * to match is caught as well as one that leaves it, and an update changed a field the read used.
 */
export const touches = (read: StoredRead, change: ResourceChange, types: Record<string, string>) => {
  if (read.resource !== change.resource) return false
  if (change.before && change.after && read.fields && !change.changed.some((field) => read.fields!.includes(field))) return false
  return [change.before, change.after].some((record) => record !== undefined && mayMatch(read.condition, record, types))
}

/** The `(resource, field, value)` triples of the changes' records, which the reads' equality index is searched by. */
export const changeKeys = (changes: readonly ResourceChange[], typesOf: (resource: string) => Record<string, string>) => {
  const triples = new Map<string, [string, string, string]>()
  for (const change of changes) {
    const types = typesOf(change.resource)
    for (const record of [change.before, change.after]) {
      for (const { field, value } of record ? equalityKeys(record, types) : []) triples.set(JSON.stringify([change.resource, field, value]), [change.resource, field, value])
    }
  }
  return [...triples.values()]
}
