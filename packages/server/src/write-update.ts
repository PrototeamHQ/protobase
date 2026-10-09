import type { Db } from '@protobase/query'
import type { CheckedFilter } from '@protobase/schema'
import type { Deps } from './deps'
import { fetchRecord, updateRecord, type StoredRecord } from './records'
import { targetFilter, type RequestAccess } from './request-access'
import { assertWritten, checkPrecondition, decide, denied, firstKeyField, missing, notifier } from './write-shared'
import { tenantScope } from './tenant'
import type { Row } from './types'
import { validateBody } from './validate-body'

/** An update that was loaded, locked and checked but not yet written. */
export type UpdatePlan = { current: StoredRecord; values: Row; filter?: CheckedFilter }

/**
 * Everything an update needs before it writes: the row (locked, inside the caller's tenant and row filters), the ETag
 * precondition, validation against the fields the caller may write, and the record-level rule with its filter.
 */
export const planUpdate = async (trx: Db, access: RequestAccess, key: (string | number)[], body: unknown, ifMatch: string | null, required = true): Promise<UpdatePlan> => {
  const { entry, full } = access
  const tenant = tenantScope(entry, access.session)?.tenantValue
  const target = targetFilter(access, 'update')
  const current = await fetchRecord(trx, entry, key, tenant, { deleted: 'hide', lock: true, ...(target && { filter: target }), etagFields: Object.keys(access.model.fields) })
  if (!current) throw missing(entry)
  checkPrecondition(current, ifMatch, required)
  const values = validateBody(access, 'update', body, current.record)
  const filter = Object.keys(values).length === 0 ? undefined : await decide(access, 'update', current.record, values)
  if (filter && !(await fetchRecord(trx, entry, key, tenant, { filter, fields: [firstKeyField(access)] }))) throw denied(entry, 'update')
  return { current, values, ...(filter && { filter }) }
}

/** Writes a planned update, checks the row as written against the filters, and runs the hooks. */
export const applyUpdate = async (trx: Db, deps: Deps, access: RequestAccess, key: (string | number)[], plan: UpdatePlan) => {
  const { entry } = access
  const tenant = tenantScope(entry, access.session)?.tenantValue
  const updated = await updateRecord(trx, entry, key, tenant, plan.values, { etagFields: Object.keys(access.model.fields) })
  await assertWritten(trx, access, updated, 'update', access.resolved.rowFilter.update, plan.filter)
  await notifier(deps, access)(trx, 'update', plan.current.record, updated.record)
  return updated
}
