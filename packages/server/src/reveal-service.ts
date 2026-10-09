import { encodeKey } from '@protobase/schema'
import type { AuditEvent } from './types'
import type { Deps } from './deps'
import { badRequest, notFound } from './problem'
import { fetchReadable } from './read-service'
import type { Entry } from './registry'
import { requestAccess, requireOperation } from './request-access'
import { tenantScope } from './tenant'
import { readTransaction } from './transactions'
import type { Session } from './types'

export type RevealRequest = { key: (string | number)[]; field: unknown; origin: AuditEvent['origin'] }

/**
 * The value of one sensitive field of one record, for a caller who may read the record and the field: the same tenant,
 * row filter and record-level rule as a get. The reveal is published to the audit queue before the value is returned;
 * when publishing fails, so does the reveal.
 */
export const revealField = async (deps: Deps, entry: Entry, session: Session, request: RevealRequest) => {
  const access = await requestAccess(deps, entry, session)
  requireOperation(access, 'read')
  const name = typeof request.field === 'string' ? request.field : ''
  const field = Object.hasOwn(access.readable.fields, name) ? access.readable.fields[name]! : undefined
  if (!field) throw badRequest('invalid-parameter', `Unknown field "${name}"`)
  if (!field.sensitive) throw badRequest('invalid-parameter', `"${name}" is not sensitive; it comes with the record`)

  const keyFields = access.full.primaryKey.map((part) => access.full.fields[part]!)
  const found = await readTransaction(deps.db, deps.statementTimeoutMs, (trx) => fetchReadable(trx, access, request.key, 'hide', { fields: [...keyFields, access.full.fields[name]!] }))
  if (!found) throw notFound(`No ${entry.name} with this key`)

  const tenant = tenantScope(entry, session)?.tenantValue
  await deps.audit.publish({
    type: 'field.revealed',
    at: new Date().toISOString(),
    actor: { id: session.user.id, roles: [...session.user.roles] },
    ...(tenant !== undefined && { tenant }),
    resource: entry.name,
    recordKey: encodeKey(request.key),
    field: name,
    origin: request.origin,
  })
  return { field: name, value: found.record[name] ?? null }
}
