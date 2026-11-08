import type { Db } from '@protobase/query'
import { fetchRecord } from '../records'
import { recordDecision, targetFilter, type RequestAccess } from '../request-access'
import { tenantScope } from '../tenant'
import type { Row } from '../types'

/**
 * Whether the caller may change this workflow as the record update path decides it: the update row filter and the
 * record-level update rule, beside the read access `fetchReadable` checked.
 */
export const mayUpdateWorkflow = async (trx: Db, access: RequestAccess, id: string, record: Row) => {
  const tenant = tenantScope(access.entry, access.session)?.tenantValue
  const key = [access.full.fields[access.full.primaryKey[0]!]!]
  const filter = targetFilter(access, 'update')
  if (filter && !(await fetchRecord(trx, access.entry, [id], tenant, { filter, fields: key }))) return false
  if (!access.resolved.recordChecks.includes('update')) return true
  const decision = await recordDecision(access, 'update', record)
  if (typeof decision === 'boolean') return decision
  return Boolean(await fetchRecord(trx, access.entry, [id], tenant, { filter: decision, fields: key }))
}
