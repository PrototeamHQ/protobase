import type { Db } from '@protobase/query'
import type { FormModel } from '@protobase/schema'
import type { Deps } from './deps'
import { blockedDelete } from './blocked-delete'
import { insertOrOpen } from './open-existing'
import { isDatabaseError } from './error-handler'
import { attachFiles, scheduleRemovedFiles } from './files/attach'
import type { ScheduledDelete } from './files/cleanup-schedule'
import { badRequest, HttpProblem } from './problem'
import { bindingOf, pendingBinding } from './encryption/binding'
import { encryptedValuesOf, hasEncryptedValues, sealValues } from './encryption/seal-values'
import { deleteRecord, fetchRecord, restoreRecord, updateRecord, type Shape, type StoredRecord } from './records'
import { requestAccess, requireOperation, targetFilter, writableFields, type RequestAccess } from './request-access'
import { tenantScope } from './tenant'
import { actorSettings, wakeDispatch } from './changes/actor'
import { writeTransaction } from './transactions'
import type { Row, Session, WriteCheck } from './types'
import { validateBody } from './validate-body'
import { applyUpdate, planUpdate } from './write-update'
import { assertWritten, checkParents, checkPrecondition, decide, denied, firstKeyField, keyOf, missing, notifier, shown, type WriteResult } from './write-shared'
import { checkRankAfter } from './rank-after'
import { withAuthor } from './author'
import type { Entry } from './registry'

export type { WriteResult }

export type WriteRequest =
  | { operation: 'create'; body: unknown }
  | { operation: 'update'; key: (string | number)[]; body: unknown; ifMatch: string | null }
  | { operation: 'delete' | 'undelete'; key: (string | number)[]; ifMatch: string | null }

// `.own` on create: a resource with an owner field, whose create rule is limited to rows, is created owned by the caller.
const withOwner = (access: RequestAccess, values: Row) => {
  const { owner } = access.full
  const caller = access.session.user.id
  if (!owner || !access.resolved.rowFilter.create || values[owner] !== undefined || caller === undefined) return values
  return { ...values, [owner]: caller }
}

// The first write seals encrypted values under a pending binding, as the database makes the key; this update in the same
// transaction seals them again under the key as the API shows it, so no committed value stays pending.
const bindEncrypted = async (trx: Db, deps: Deps, access: RequestAccess, row: Row, inserted: StoredRecord, shape: Shape) => {
  const { entry, full } = access
  if (!hasEncryptedValues(full, row)) return inserted
  const values = sealValues(deps.encryption, full, encryptedValuesOf(full, row), (field) => bindingOf(full, field, inserted.record))
  // updateRecord's type promises a row, but a key the API shows that finds the row no more (microseconds cut) gives none
  const bound = await updateRecord(trx, entry, keyOf(access, inserted.record), tenantScope(entry, access.session)?.tenantValue, values, shape) as StoredRecord | undefined
  if (!bound) throw new Error(`A ${entry.name} record was created whose key the API cannot address, so its encrypted fields cannot be bound to it`)
  return bound
}

const create = async (trx: Db, deps: Deps, access: RequestAccess, body: unknown, removed: ScheduledDelete[]): Promise<WriteResult> => {
  const { entry, full } = access
  const scope = tenantScope(entry, access.session)
  const tenantValues = full.tenant && scope ? { [full.tenant]: scope.tenantValue } : {}
  // The owner is preset before validation when the caller may write it (it counts as given), otherwise set afterwards.
  const preset = typeof body === 'object' && body !== null && !Array.isArray(body) && writableFields(access, 'create').includes(full.owner ?? '')
    ? withOwner(access, body as Row)
    : body
  const values = await attachFiles(access, withAuthor(access, withOwner(access, validateBody(access, 'create', preset, tenantValues))))
  const row = { ...values, ...tenantValues }
  const filter = await decide(access, 'create', undefined, row)
  // Before the insert, so a missing parent answers as an invisible one does rather than as a foreign key conflict; after
  // it, from the record as written, for a parent a default or trigger sets.
  const parents = checkParents(trx, access, 'create')
  await parents(row)
  const shape = { etagFields: Object.keys(access.model.fields) }
  const inserted = await insertOrOpen(trx, access, sealValues(deps.encryption, full, row, (field) => pendingBinding(full, field)), shape)
  const created = await bindEncrypted(trx, deps, access, row, inserted, shape)
  await assertWritten(trx, access, created, 'create', access.resolved.rowFilter.create, filter)
  await parents(created.record)
  // A new record had no rank before, so any pair it ranks out of order counts
  if (full.position) await checkRankAfter(trx, deps, access, full.position.field, [{ key: keyOf(access, created.record), before: null }])
  await notifier(deps, access, removed)(trx, 'create', undefined, created.record)
  return shown(access, created)
}

const update = async (trx: Db, deps: Deps, access: RequestAccess, request: Extract<WriteRequest, { operation: 'update' }>, removed: ScheduledDelete[]): Promise<WriteResult> => {
  const plan = await planUpdate(trx, access, request.key, request.body, request.ifMatch)
  if (Object.keys(plan.values).length === 0) return shown(access, plan.current)
  const updated = await applyUpdate(trx, deps, access, request.key, plan, removed)
  const rank = access.full.position?.field
  if (rank && rank in plan.values) await checkRankAfter(trx, deps, access, rank, [{ key: keyOf(access, updated.record), before: plan.current.record[rank] }])
  return shown(access, updated)
}

const removeOrRestore = async (trx: Db, deps: Deps, access: RequestAccess, request: Extract<WriteRequest, { operation: 'delete' | 'undelete' }>, removed: ScheduledDelete[]): Promise<WriteResult> => {
  const { entry, full } = access
  const undelete = request.operation === 'undelete'
  if (undelete && !full.softDelete) {
    throw badRequest('undelete-unsupported', `Resource "${entry.name}" does not soft delete, so there is nothing to undelete`)
  }
  const scope = tenantScope(entry, access.session)
  const operation = undelete ? 'update' : 'delete'
  const deleted = undelete ? 'only' : 'hide'
  const target = targetFilter(access, operation)
  const shape = { etagFields: Object.keys(access.model.fields) }
  const current = await fetchRecord(trx, entry, request.key, scope?.tenantValue, { deleted, lock: true, ...(target && { filter: target }), ...shape })
  if (!current) {
    const live = undelete && (await fetchRecord(trx, entry, request.key, scope?.tenantValue, { filter: access.resolved.rowFilter.read, fields: [firstKeyField(access)] }))
    throw live ? new HttpProblem(409, 'not-deleted', 'Conflict', `This ${entry.name} record is not deleted`) : missing(entry)
  }
  checkPrecondition(current, request.ifMatch, false)
  const filter = await decide(access, operation, current.record)
  if (filter && !(await fetchRecord(trx, entry, request.key, scope?.tenantValue, { deleted, filter, fields: [firstKeyField(access)] }))) throw denied(entry, operation)
  await checkParents(trx, access, operation)(current.record)
  const notify = notifier(deps, access, removed)
  if (undelete) {
    const restored = await restoreRecord(trx, entry, request.key, scope?.tenantValue, shape)
    await assertWritten(trx, access, restored, 'undelete', access.resolved.rowFilter.update, filter)
    await notify(trx, 'undelete', current.record, restored.record)
    return shown(access, restored)
  }
  const gone = await deleteRecord(trx, entry, request.key, scope?.tenantValue, shape).catch(async (error: unknown) => {
    // Other records still point at it: say which, as far as the caller may know
    if (isDatabaseError(error) && error.code === '23503') throw await blockedDelete(deps, access, error)
    throw error
  })
  await notify(trx, 'delete', current.record, undefined)
  return shown(access, gone)
}

/**
 * One write inside an open transaction, for a caller whose access is already resolved: operations and field access,
 * tenant scope, validation against the fields they may write, optimistic concurrency, row filters and record-level
 * rules checked in the database, then the hooks; a rank written by the resource's position with `after` must keep the
 * record below what it depends on (see `checkRankAfter`). The files it takes out of the row go to `removed`, which the
 * caller schedules for deletion once the transaction commits (`scheduleRemovedFiles`). Batches run many of these in one
 * transaction.
 */
export const writeIn = async (trx: Db, deps: Deps, access: RequestAccess, request: WriteRequest, removed: ScheduledDelete[]): Promise<WriteResult> => {
  requireOperation(access, request.operation === 'undelete' ? 'update' : request.operation)
  if (request.operation === 'create') return create(trx, deps, access, request.body, removed)
  if (request.operation === 'update') return update(trx, deps, access, request, removed)
  return removeOrRestore(trx, deps, access, request, removed)
}

/** Runs the checks that come before a create's or update's transaction opens (`WriteCheck`) on the body as sent. */
export const checkBeforeWrite = async (deps: Deps, write: Parameters<WriteCheck>[0]) => {
  for (const check of deps.writeChecks) await check(write)
}

/**
 * The path every single write takes: resolve access once, the checks that come before the transaction, then `writeIn`
 * in its own transaction with a statement timeout. The caller has already authenticated `session`; `form` is the
 * public form a visitor creates through.
 */
export const runWrite = async (deps: Deps, entry: Entry, session: Session, request: WriteRequest, form?: FormModel): Promise<WriteResult> => {
  const access = await requestAccess(deps, entry, session, form)
  requireOperation(access, request.operation === 'undelete' ? 'update' : request.operation)
  if (request.operation === 'create' || request.operation === 'update') await checkBeforeWrite(deps, { resource: entry.name, operation: request.operation, body: request.body })
  const removed: ScheduledDelete[] = []
  const result = await writeTransaction(deps.db, deps.statementTimeoutMs, (trx) => writeIn(trx, deps, access, request, removed), actorSettings(deps, session))
  await scheduleRemovedFiles(deps, removed)
  wakeDispatch(deps)
  return result
}
