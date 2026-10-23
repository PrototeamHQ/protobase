import type { Db } from '@protobase/query'
import type { CheckedFilter } from '@protobase/schema'
import type { Deps } from './deps'
import { bindingOf } from './encryption/binding'
import { sealValues } from './encryption/seal-values'
import { attachFiles } from './files/attach'
import type { ScheduledDelete } from './files/cleanup-schedule'
import { badRequest } from './problem'
import { fetchRecord, updateRecord, type StoredRecord } from './records'
import { targetFilter, type RequestAccess } from './request-access'
import { assertWritten, checkParents, checkPrecondition, decide, denied, firstKeyField, missing, notifier } from './write-shared'
import { tenantScope } from './tenant'
import type { Row } from './types'
import { validateBody } from './validate-body'

/** An update that was loaded, locked and checked but not yet written; `parents` checks the record as written. */
export type UpdatePlan = { current: StoredRecord; values: Row; filter?: CheckedFilter; parents: (record: Row) => Promise<void> }

/**
 * Everything an update needs before it writes: the row (locked, inside the caller's tenant and row filters), the ETag
 * precondition, validation against the fields the caller may write, the record-level rule with its filter, and the
 * parents (`.parent()`) it leaves and moves to, checked in one call so they are locked in one order.
 */
export const planUpdate = async (trx: Db, access: RequestAccess, key: (string | number)[], body: unknown, ifMatch: string | null, required = true): Promise<UpdatePlan> => {
  const { entry, full } = access
  const tenant = tenantScope(entry, access.session)?.tenantValue
  const target = targetFilter(access, 'update')
  const current = await fetchRecord(trx, entry, key, tenant, { deleted: 'hide', lock: true, ...(target && { filter: target }), etagFields: Object.keys(access.model.fields) })
  if (!current) throw missing(entry)
  checkPrecondition(current, ifMatch, required)
  const values = await attachFiles(access, validateBody(access, 'update', body, current.record), current.record)
  const filter = Object.keys(values).length === 0 ? undefined : await decide(access, 'update', current.record, values)
  if (filter && !(await fetchRecord(trx, entry, key, tenant, { filter, fields: [firstKeyField(access)] }))) throw denied(entry, 'update')
  const parents = checkParents(trx, access, 'update')
  if (Object.keys(values).length > 0) await parents(current.record, { ...current.record, ...values })
  return { current, values, ...(filter && { filter }), parents }
}

// Encrypted values are bound to their record's key, so a record that has encrypted fields keeps its key.
const refuseKeyChange = (access: RequestAccess, plan: UpdatePlan) => {
  const { full, entry } = access
  if (!Object.values(full.fields).some((field) => field.encrypted)) return
  const changed = full.primaryKey.some((name) => Object.hasOwn(plan.values, name) && String(plan.values[name]) !== String(plan.current.record[name]))
  if (changed) throw badRequest('key-change-unsupported', `The key of a ${entry.name} record cannot change: its encrypted fields are bound to it`)
}

/** Writes a planned update, checks the row as written against the filters, and runs the hooks (see `notifier`). */
export const applyUpdate = async (trx: Db, deps: Deps, access: RequestAccess, key: (string | number)[], plan: UpdatePlan, removed: ScheduledDelete[]) => {
  const { entry, full } = access
  refuseKeyChange(access, plan)
  const tenant = tenantScope(entry, access.session)?.tenantValue
  const values = sealValues(deps.encryption, full, plan.values, (field) => bindingOf(full, field, plan.current.record))
  const updated = await updateRecord(trx, entry, key, tenant, values, { etagFields: Object.keys(access.model.fields) })
  await assertWritten(trx, access, updated, 'update', access.resolved.rowFilter.update, plan.filter)
  await plan.parents(updated.record)
  await notifier(deps, access, removed)(trx, 'update', plan.current.record, updated.record)
  return updated
}
