import type { Db } from '@protobase/query'
import type { Deps } from './deps'
import { presentFiles } from './files/present'
import { notFound } from './problem'
import type { Entry } from './registry'
import { fetchRecord, type Shape } from './records'
import { recordDecision, requestAccess, requireOperation, targetFilter, visibleFields, writableFields, type RequestAccess } from './request-access'
import { rowPermissions } from './row-permissions'
import { pickFields } from './rows'
import type { DeletedRows } from './sql-parts'
import { tenantScope } from './tenant'
import { readTransaction } from './transactions'
import type { Session } from './types'

export type RecordPermissions = { update: boolean; delete: boolean; fields: Record<string, 'edit' | 'read'> }

/** `edit` for fields the caller may change on this record, `read` for the rest (sensitive ones included); hidden fields are not listed at all. */
export const fieldModes = (access: RequestAccess, canUpdate: boolean) =>
  Object.fromEntries(Object.keys(access.readable.fields).map((name) => [name, canUpdate && writableFields(access, 'update').includes(name) ? 'edit' : 'read'])) as RecordPermissions['fields']

/**
 * The row with this key if the caller may read it: inside their tenant and row filter, and passing a record-level read
 * rule. Such a rule may look at fields the caller cannot see, so then the whole row is read; the caller cuts it down.
 */
export const fetchReadable = async (trx: Db, access: RequestAccess, key: (string | number)[], deleted: DeletedRows, { fields, ...shape }: Shape) => {
  const { entry } = access
  const tenant = tenantScope(entry, access.session)?.tenantValue
  const recordRule = access.resolved.recordChecks.includes('read')
  const filter = targetFilter(access, 'read')
  const current = await fetchRecord(trx, entry, key, tenant, { deleted, ...(filter && { filter }), ...shape, ...(!recordRule && fields && { fields }) })
  if (!current || !recordRule) return current
  const decision = await recordDecision(access, 'read', current.record)
  if (decision === false) return undefined
  if (decision !== true && !(await fetchRecord(trx, entry, key, tenant, { deleted, filter: decision, fields: [access.full.fields[access.full.primaryKey[0]!]!] }))) return undefined
  return current
}

/**
 * The record with this key as the caller may see it: readable fields only, inside the caller's tenant and row filter.
 * A key outside the tenant, outside the row filter, or failing a record-level read rule is a plain 404.
 */
export const readRecord = async (deps: Deps, entry: Entry, session: Session, key: (string | number)[], deleted: DeletedRows = 'hide') => {
  const access = await requestAccess(deps, entry, session)
  requireOperation(access, 'read')
  const names = Object.keys(access.model.fields)

  const found = await readTransaction(deps.db, deps.statementTimeoutMs, async (trx) => {
    const current = await fetchReadable(trx, access, key, deleted, { etagFields: names, fields: visibleFields(access) })
    if (!current) return undefined
    const record = pickFields(current.record, names)
    const [row] = await rowPermissions(trx, access, [record])
    return { record, etag: current.etag, permissions: { ...row!, fields: fieldModes(access, row!.update) } }
  })
  if (!found) throw notFound(`No ${entry.name} with this key`)
  return { ...found, record: (await presentFiles(access, [found.record]))[0]! }
}
