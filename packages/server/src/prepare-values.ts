import type { Db } from '@protobase/query'
import { FieldIssue, type PrepareContext } from '@protobase/schema'
import { maskEncrypted } from './encryption/mask-stored'
import { HttpProblem } from './problem'
import { writableFields, type RequestAccess } from './request-access'
import type { Row } from './types'

// The 422 for a refusal: the field named when the caller reads it, as `.validate()` rules name theirs, `_record` otherwise.
const unprocessable = (access: RequestAccess, operation: 'create' | 'update', issue: FieldIssue) => {
  const named = Object.hasOwn(access.readable.fields, issue.field) || writableFields(access, operation).includes(issue.field)
  const field = named ? issue.field : '_record'
  return new HttpProblem(422, 'invalid-record', 'Unprocessable Content', `The record cannot be written: ${field}: ${issue.message}`, { errors: [{ field, code: 'invalid-value', message: issue.message }] })
}

// The tenant and the author only the server sets, from the caller; a field the resource does not have is no value.
const checkPrepared = (access: RequestAccess, values: Row) => {
  const { full, entry } = access
  for (const name of Object.keys(values)) {
    if (!Object.hasOwn(full.fields, name)) throw new Error(`Resource "${entry.name}": .prepare() returned "${name}", which is not one of its fields`)
    if (name === full.tenant || name === full.author) throw new Error(`Resource "${entry.name}": .prepare() returned "${name}", which only the server sets, from the caller`)
  }
  return values
}

const runPreparers = async (access: RequestAccess, values: Row, context: PrepareContext<Row>) => {
  let prepared = values
  for (const prepare of access.entry.source.preparers ?? []) prepared = checkPrepared(access, await prepare(prepared, context))
  return prepared
}

/**
 * A create's or update's values as the resource's `.prepare()` hooks rewrite them, in order, inside the write's
 * transaction `trx`; `before` is the stored record an update changes. A `FieldIssue` they throw answers 422.
 */
export const prepareValues = async (trx: Db, access: RequestAccess, operation: 'create' | 'update', values: Row, before?: Row) => {
  if (!access.entry.source.preparers?.length) return values
  const { session, full } = access
  const context: PrepareContext<Row> = {
    operation,
    user: session.user,
    session,
    ...(session.tenant !== undefined && { tenant: session.tenant }),
    trx,
    ...(before && { before: maskEncrypted(full, before) }),
  }
  try {
    return await runPreparers(access, values, context)
  } catch (error) {
    if (error instanceof FieldIssue) throw unprocessable(access, operation, error)
    throw error
  }
}
