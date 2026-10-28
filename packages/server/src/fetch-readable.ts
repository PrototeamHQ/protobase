import type { Db } from '@protobase/query'
import { fetchRecord, type FetchOptions, type Shape } from './records'
import { recordDecision, targetFilter, type RequestAccess } from './request-access'
import type { DeletedRows } from './sql-parts'
import { tenantScope } from './tenant'

/**
 * The row with this key if the caller may read it: inside their tenant, row filter and the parents they read, and
 * passing a record-level read rule. Such a rule may look at fields the caller cannot see, so then the whole row is read;
 * the caller cuts it down. `lock` locks the row the first read finds.
 */
export const fetchReadable = async (trx: Db, access: RequestAccess, key: (string | number)[], deleted: DeletedRows, { fields, lock, ...shape }: Shape & Pick<FetchOptions, 'lock'>) => {
  const { entry } = access
  const tenant = tenantScope(entry, access.session)?.tenantValue
  const recordRule = access.resolved.recordChecks.includes('read')
  const filter = targetFilter(access, 'read')
  const current = await fetchRecord(trx, entry, key, tenant, { deleted, ...(filter && { filter }), parents: access.parents, ...(lock && { lock }), ...shape, ...(!recordRule && fields && { fields }) })
  if (!current || !recordRule) return current
  const decision = await recordDecision(access, 'read', current.record)
  if (decision === false) return undefined
  if (decision !== true && !(await fetchRecord(trx, entry, key, tenant, { deleted, filter: decision, fields: [access.full.fields[access.full.primaryKey[0]!]!] }))) return undefined
  return current
}
