import type { Deps } from './deps'
import { presentFiles } from './files/present'
import { notFound } from './problem'
import type { Entry } from './registry'
import { fetchReadable } from './fetch-readable'
import { requestAccess, requireOperation, visibleFields, writableFields, type RequestAccess } from './request-access'
import { rowPermissions } from './row-permissions'
import { pickFields } from './rows'
import type { DeletedRows } from './sql-parts'
import { readTransaction } from './transactions'
import type { Session } from './types'

export type RecordPermissions = { update: boolean; delete: boolean; fields: Record<string, 'edit' | 'read'> }

/**
 * `edit` for fields the caller may change on this record, `read` for the rest (sensitive ones included); hidden fields
 * are not listed at all, nor is a write-only one unless the caller may change it here.
 */
export const fieldModes = (access: RequestAccess, canUpdate: boolean) => {
  const writable = canUpdate ? writableFields(access, 'update') : []
  const readable = Object.keys(access.readable.fields).map((name) => [name, writable.includes(name) ? 'edit' : 'read'])
  const writeOnly = writable.filter((name) => !Object.hasOwn(access.readable.fields, name)).map((name) => [name, 'edit'])
  return Object.fromEntries([...readable, ...writeOnly]) as RecordPermissions['fields']
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
