import type { FieldModel, ResourceModel } from '@protobase/schema'
import { encodeKey } from '@protobase/schema/internal'
import { bindingOf } from './encryption/binding'
import { openText } from './encryption/envelope-open'
import type { Deps } from './deps'
import { badRequest, HttpProblem, notFound } from './problem'
import { fetchReadable } from './fetch-readable'
import type { Entry } from './registry'
import { requestAccess, requireOperation } from './request-access'
import { tenantScope } from './tenant'
import { readTransaction } from './transactions'
import type { AuditOrigin, Row, Session } from './types'

// An encrypted field opens under the record it was read from; an empty one reveals null like any other.
const revealedValue = (deps: Deps, model: ResourceModel, field: FieldModel, record: Row) => {
  const stored = record[field.name] ?? null
  if (!field.encrypted || stored === null) return stored
  if (!deps.encryption) throw new Error(`"${model.name}" has encrypted fields but no encryption runtime`)
  return openText(deps.encryption.keyring, bindingOf(model, field, record), String(stored), { resource: model.name, field: field.name })
}

export type RevealRequest = { key: (string | number)[]; field: unknown; origin: AuditOrigin }

/** The refusal of a reveal that needs a strong sign-in more recent than the caller's, which the app answers by asking them to confirm it's them. */
export const strongSignInRequired = (minutes: number) =>
  new HttpProblem(403, 'strong-sign-in-required', 'Forbidden', `Confirm it's you with a passkey or a second step: this needs one in the last ${minutes} minutes.`, { minutes })

// Only the user's own sign-in counts: staff signed in as them, and an outside app acting as them, proved nothing as them.
const requireStrongSignIn = async (session: Session, minutes: number, now = new Date()) => {
  const at = session.signIn && !session.signIn.staff && !session.client ? await session.signIn.strongAt?.() : undefined
  if (at && now.getTime() - at.getTime() <= minutes * 60_000) return
  throw strongSignInRequired(minutes)
}

const publishReveal = async (deps: Deps, entry: Entry, session: Session, request: RevealRequest, field: string) => {
  const tenant = tenantScope(entry, session)?.tenantValue
  await deps.audit.publish({
    type: 'field.revealed',
    at: new Date().toISOString(),
    actor: { id: session.user.id, roles: [...session.user.roles] },
    ...(tenant !== undefined && { tenant }),
    resource: entry.name,
    recordKey: encodeKey(request.key),
    field,
    origin: request.origin,
  })
}

/**
 * The value of one sensitive field of one record, for a caller who may read the record and the field: the same tenant,
 * row filter and record-level rule as a get. A field that needs a recent strong sign-in is refused without one
 * (`strongSignInRequired`). The reveal is published to the audit queue before the value is returned; when publishing
 * fails, so does the reveal.
 */
export const revealField = async (deps: Deps, entry: Entry, session: Session, request: RevealRequest) => {
  const access = await requestAccess(deps, entry, session)
  requireOperation(access, 'read')
  const name = typeof request.field === 'string' ? request.field : ''
  const field = Object.hasOwn(access.readable.fields, name) ? access.readable.fields[name]! : undefined
  if (!field) throw badRequest('invalid-parameter', `Unknown field "${name}"`)
  if (!field.sensitive) throw badRequest('invalid-parameter', `"${name}" is not sensitive; it comes with the record`)

  const { full } = access
  // An encrypted value is bound to its tenant as well as its key
  const tenantField = full.fields[name]!.encrypted && full.tenant && !full.primaryKey.includes(full.tenant) ? [full.tenant] : []
  const keyFields = [...full.primaryKey, ...tenantField].map((part) => full.fields[part]!)
  const found = await readTransaction(deps.db, deps.statementTimeoutMs, (trx) => fetchReadable(trx, access, request.key, 'hide', { fields: [...keyFields, full.fields[name]!] }))
  if (!found) throw notFound(`No ${entry.name} with this key`)
  if (field.strongSignIn) await requireStrongSignIn(session, field.strongSignIn.minutes)
  // Every access check is done: only now is the value decrypted, and one that does not open is a 500 with no audit.
  const value = revealedValue(deps, access.full, full.fields[name]!, found.record)
  await publishReveal(deps, entry, session, request, name)
  return { field: name, value }
}
