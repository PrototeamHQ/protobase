import type { Deps } from './deps'
import { presentFiles } from './files/present'
import { deletedRows, selectedFields } from './params'
import { notFound } from './problem'
import type { Entry } from './registry'
import { fetchReadable } from './fetch-readable'
import { ownScope, requestAccess, requireOperation, visibleFields, writableFields, type RequestAccess } from './request-access'
import { keyFilter } from './live/token/key-filter'
import { rowPermissions } from './row-permissions'
import { pickFields } from './rows'
import { readTransaction, snapshotReadTransaction } from './transactions'
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
 * A key outside the tenant, outside the row filter, or failing a record-level read rule is a plain 404. `showDeleted`
 * also finds a soft-deleted record, and is refused on a resource without a soft delete once the caller may read it.
 * `live` asks for a live token of the read (`token`), for a live resource when the app has one to give and no
 * record-level read rule decides it, which reads no filter: the read then runs in one snapshot. `fields`, the
 * selection of `?fields=`, is checked against the caller's readable fields and is what the token names (`columns`).
 */
export const readRecord = async (deps: Deps, entry: Entry, session: Session, key: (string | number)[], showDeleted = false, live = false, fields?: string) => {
  const access = await requestAccess(deps, entry, session)
  requireOperation(access, 'read')
  const deleted = deletedRows(access.full, showDeleted)
  const names = Object.keys(access.model.fields)
  const asked = live && entry.model.live && deps.liveTokens && !access.resolved.recordChecks.includes('read')
  const subject = asked ? await deps.liveTokens!.subject(session) : undefined
  const transaction = subject ? snapshotReadTransaction : readTransaction
  // The token names the fields asked for, checked before its read; without one, `fields` is checked once the record is found
  const sealed = subject && selectedFields(access.model, fields)

  const found = await transaction(deps.db, deps.statementTimeoutMs, async (trx) => {
    const current = await fetchReadable(trx, access, key, deleted, { etagFields: names, fields: visibleFields(access) })
    if (!current) return undefined
    const record = pickFields(current.record, names)
    const [row] = await rowPermissions(trx, access, [record])
    const full = deleted === 'show' ? { ...access.full, softDelete: undefined } : access.full
    const read = { model: full, scope: ownScope(access, full), filter: keyFilter(full, key), fields: sealed || names }
    const token = subject && (await deps.liveTokens!.seal(trx, subject, read))
    return { record, etag: current.etag, permissions: { ...row!, fields: fieldModes(access, row!.update) }, token }
  })
  if (!found) throw notFound(`No ${entry.name} with this key`)
  return { ...found, columns: selectedFields(access.model, fields), record: (await presentFiles(access, [found.record]))[0]! }
}
