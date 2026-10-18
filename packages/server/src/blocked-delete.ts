import type { Deps } from './deps'
import { HttpProblem } from './problem'
import type { Entry } from './registry'
import { requestAccess, type RequestAccess } from './request-access'

/** Where Postgres says a foreign key violation happened: for a delete, the table whose rows still point at the record. */
export type ViolatedTable = { table?: string; schema?: string }

/**
 * The resource whose rows kept `deleted`'s record from being deleted, from the table a foreign key violation names, and
 * its relation field pointing at `deleted` when there is exactly one, on a single column, so its list can be filtered by
 * it. `undefined` when no resource or several read that table, or none of its fields points at `deleted`, as when a
 * cascade was blocked further down.
 */
export const blockingRelation = (error: ViolatedTable, deleted: Entry, entries: Entry[]): { entry: Entry; field?: string } | undefined => {
  const tables = entries.filter(({ model }) => model.table.name === error.table && (model.table.schema === undefined || model.table.schema === error.schema))
  if (tables.length !== 1) return undefined
  const entry = tables[0]!
  const pointing = Object.entries(entry.model.fields).filter(([, field]) => field.type === 'relation' && field.relation?.resource === deleted.name)
  if (pointing.length === 0) return undefined
  const only = pointing.length === 1 ? pointing[0]! : undefined
  return only && only[1].relation!.columns.length === 1 ? { entry, field: only[0] } : { entry }
}

/**
 * The 409 for a delete other records still point at. It names their resource (`blockedBy`) only to a caller who may
 * list it, and the field pointing at the record only when they may filter by it, as with any field they cannot see.
 */
export const blockedDelete = async (deps: Deps, access: RequestAccess, error: ViolatedTable) => {
  const match = blockingRelation(error, access.entry, deps.registry.entries)
  const blocking = match && (await requestAccess(deps, match.entry, access.session))
  const listed = blocking && blocking.resolved.operations.list
  const field = listed && match.field && blocking.model.fields[match.field]?.filterable ? match.field : undefined
  const blockedBy = listed ? { resource: match.entry.name, ...(field && { field }) } : undefined
  return new HttpProblem(409, 'conflict', 'Conflict', 'Other records still point at this record', blockedBy && { blockedBy })
}
