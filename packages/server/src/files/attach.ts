import { badRequest } from '../problem'
import type { RequestAccess } from '../request-access'
import { tenantScope } from '../tenant'
import type { Row, WriteOperation } from '../types'
import type { FieldError } from '../validate-body'
import { readTicket, type TicketScope } from './ticket'
import { baseOf, parseUri } from './uri'

/** The ticket scope of a caller's upload for one field. */
export const ticketScope = (access: RequestAccess, field: string): TicketScope => ({
  tenant: String(tenantScope(access.entry, access.session)?.tenantValue ?? ''),
  resource: access.entry.name,
  field,
  user: String(access.session.user.id),
})

const fileFields = (access: RequestAccess) => Object.values(access.full.fields).filter((field) => field.file)

/**
 * File values of a validated create or update body, made ready to store: a ticket from `:upload` becomes its clean URI
 * plus the derived fields it carries, `null` clears the field and its derived fields, and the stored value itself is a
 * no-op. Anything else is refused, so a row can only point at a file its writer uploaded for that field.
 */
export const attachFiles = async (access: RequestAccess, values: Row, current?: Row): Promise<Row> => {
  const names = Object.keys(values).filter((name) => access.full.fields[name]?.file)
  const files = access.deps.files
  if (names.length === 0 || !files) return values
  const result = { ...values }
  const errors: FieldError[] = []
  const now = Math.floor(Date.now() / 1000)
  for (const name of names) {
    const field = access.full.fields[name]!
    const derive = field.file!.derive ?? []
    const value = values[name]
    if (value === null) {
      for (const target of derive) result[target] = null
      continue
    }
    if (current && value === current[name]) {
      delete result[name]
      continue
    }
    const ticket = await readTicket(files.signer, String(value), ticketScope(access, name), now)
    if (!ticket.ok || ticket.ref.provider !== field.file!.provider) {
      const expired = !ticket.ok && ticket.reason === 'expired'
      errors.push({ field: name, code: 'invalid-value', message: expired ? 'The upload expired; upload the file again' : 'Not a file uploaded for this field; upload it with :upload first' })
      continue
    }
    result[name] = ticket.uri
    for (const target of derive) result[target] = Object.hasOwn(ticket.derived, target) ? ticket.derived[target] : null
  }
  if (errors.length > 0) throw badRequest('invalid-record', `The request body is invalid: ${errors[0]!.field}: ${errors[0]!.message}`, { errors })
  return result
}

/**
 * Schedules the delete of every file a write took out of its row: a replaced or cleared value, or all of a hard-deleted
 * row's files, each due after its provider's retention. It runs inside the write transaction, before the commit: if
 * the write rolls back, the file is still referenced when the entry is due, and stays.
 */
export const scheduleRemovedFiles = async (access: RequestAccess, operation: WriteOperation, before?: Row, after?: Row) => {
  const files = access.deps.files
  if (!files || !before || operation === 'create' || operation === 'undelete') return
  if (operation === 'delete' && access.full.softDelete) return
  const now = Date.now()
  const removed = fileFields(access).flatMap((field) => {
    const old = before[field.name]
    if (typeof old !== 'string') return []
    const next = after?.[field.name]
    if (typeof next === 'string' && baseOf(next) === baseOf(old)) return []
    const ref = parseUri(old)
    if (!ref || !files.providers[ref.provider]) return []
    return [{ provider: ref.provider, path: ref.path, due: new Date(now + files.retention(ref.provider)) }]
  })
  if (removed.length > 0) await files.schedule.add(removed)
}
