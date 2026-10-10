import type { Db } from '@protobase/query'
import type { Deps } from './deps'
import { attachFiles } from './files/attach'
import { badRequest, HttpProblem } from './problem'
import { deleteRecord, fetchRecord, insertRecord, restoreRecord } from './records'
import { requestAccess, requireOperation, targetFilter, writableFields, type RequestAccess } from './request-access'
import { tenantScope } from './tenant'
import { writeTransaction } from './transactions'
import type { Row, Session } from './types'
import { validateBody } from './validate-body'
import { applyUpdate, planUpdate } from './write-update'
import { assertWritten, checkPrecondition, decide, denied, firstKeyField, missing, notifier, shown, type WriteResult } from './write-shared'
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

const create = async (trx: Db, deps: Deps, access: RequestAccess, body: unknown): Promise<WriteResult> => {
  const { entry, full } = access
  const scope = tenantScope(entry, access.session)
  const tenantValues = full.tenant && scope ? { [full.tenant]: scope.tenantValue } : {}
  // The owner is preset before validation when the caller may write it (it counts as given), otherwise set afterwards.
  const preset = typeof body === 'object' && body !== null && !Array.isArray(body) && writableFields(access, 'create').includes(full.owner ?? '')
    ? withOwner(access, body as Row)
    : body
  const values = await attachFiles(access, withOwner(access, validateBody(access, 'create', preset, tenantValues)))
  const row = { ...values, ...tenantValues }
  const filter = await decide(access, 'create', undefined, row)
  const created = await insertRecord(trx, entry, row, { etagFields: Object.keys(access.model.fields) })
  await assertWritten(trx, access, created, 'create', access.resolved.rowFilter.create, filter)
  await notifier(deps, access)(trx, 'create', undefined, created.record)
  return shown(access, created)
}

const update = async (trx: Db, deps: Deps, access: RequestAccess, request: Extract<WriteRequest, { operation: 'update' }>): Promise<WriteResult> => {
  const plan = await planUpdate(trx, access, request.key, request.body, request.ifMatch)
  if (Object.keys(plan.values).length === 0) return shown(access, plan.current)
  return shown(access, await applyUpdate(trx, deps, access, request.key, plan))
}

const removeOrRestore = async (trx: Db, deps: Deps, access: RequestAccess, request: Extract<WriteRequest, { operation: 'delete' | 'undelete' }>): Promise<WriteResult> => {
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
  const notify = notifier(deps, access)
  if (undelete) {
    const restored = await restoreRecord(trx, entry, request.key, scope?.tenantValue, shape)
    await assertWritten(trx, access, restored, 'undelete', access.resolved.rowFilter.update, filter)
    await notify(trx, 'undelete', current.record, restored.record)
    return shown(access, restored)
  }
  const removed = await deleteRecord(trx, entry, request.key, scope?.tenantValue, shape)
  await notify(trx, 'delete', current.record, undefined)
  return shown(access, removed)
}

/**
 * One write inside an open transaction, for a caller whose access is already resolved: operations and field access,
 * tenant scope, validation against the fields they may write, optimistic concurrency, row filters and record-level
 * rules checked in the database, then the hooks. Batches run many of these in one transaction.
 */
export const writeIn = async (trx: Db, deps: Deps, access: RequestAccess, request: WriteRequest): Promise<WriteResult> => {
  requireOperation(access, request.operation === 'undelete' ? 'update' : request.operation)
  if (request.operation === 'create') return create(trx, deps, access, request.body)
  if (request.operation === 'update') return update(trx, deps, access, request)
  return removeOrRestore(trx, deps, access, request)
}

/** The path every single write takes: resolve access once, then `writeIn` in its own transaction with a statement timeout. The caller has already authenticated `session`. */
export const runWrite = async (deps: Deps, entry: Entry, session: Session, request: WriteRequest): Promise<WriteResult> => {
  const access = await requestAccess(deps, entry, session)
  requireOperation(access, request.operation === 'undelete' ? 'update' : request.operation)
  return writeTransaction(deps.db, deps.statementTimeoutMs, (trx) => writeIn(trx, deps, access, request))
}
