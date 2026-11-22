import type { Db } from '@protobase/query'
import { FieldIssue, type PrepareContext } from '@protobase/schema'
import { maskEncrypted } from './encryption/mask-stored'
import { HttpProblem } from './problem'
import { writableFields, type RequestAccess } from './request-access'
import type { Row } from './types'
import { checkRules } from './validate-body'

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
 * transaction `trx`, checked again by the `.validate()` rules on `current` as the write leaves it: the stored record
 * an update changes, which the hooks get as `before`, or the server's values a create adds. A `FieldIssue` they throw
 * answers 422.
 */
export const prepareValues = async (trx: Db, access: RequestAccess, operation: 'create' | 'update', values: Row, current: Row = {}) => {
  if (!access.entry.source.preparers?.length) return values
  const { session, full } = access
  const context: PrepareContext<Row> = {
    operation,
    user: session.user,
    session,
    ...(session.tenant !== undefined && { tenant: session.tenant }),
    trx,
    // A copy, so a hook that changes it leaves the stored record the update goes on with alone
    ...(operation === 'update' && { before: { ...maskEncrypted(full, current) } }),
  }
  try {
    return checkRules(access, operation, await runPreparers(access, values, context), current)
  } catch (error) {
    if (error instanceof FieldIssue) throw unprocessable(access, operation, error)
    throw error
  }
}
