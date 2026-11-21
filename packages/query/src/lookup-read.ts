import type { Expression, SqlBool } from 'kysely'
import type { FieldModel, ResourceModel } from '@protobase/schema'
import type { Scope } from './scope'

/**
 * How one read reads a lookup field: the linked resource's full model and the caller's scope on it with the conditions
 * it keeps to, the linked field it shows (`value`), the linked record's field matched (`match`: its key, or the
 * relation that points at this record) and this record's field matched with it (`link`: the relation, or this record's
 * key). It holds the caller's scope, so it is only on the model a query runs against, never on one sent to the caller.
 */
export type LookupRead = {
  model: ResourceModel
  scope: Scope
  conditions: Expression<SqlBool>[]
  value: FieldModel
  match: FieldModel
  link: FieldModel
}

type ReadLookup = FieldModel & { lookupRead?: LookupRead }

/** The lookup field as this read reads it. */
export const withLookupRead = (field: FieldModel, read: LookupRead): FieldModel => ({ ...field, lookupRead: read }) as ReadLookup

/**
 * How this read reads the field when it is a lookup field. A lookup field of a model the server did not resolve for a
 * caller has no read, which is a bug of the caller's code, not of the request: it throws.
 */
export const lookupReadOf = (field: FieldModel): LookupRead | undefined => {
  if (!field.lookup) return
  const read = (field as ReadLookup).lookupRead
  if (!read) throw new Error(`Lookup field "${field.name}" is read without the caller's access to its linked record`)
  return read
}
