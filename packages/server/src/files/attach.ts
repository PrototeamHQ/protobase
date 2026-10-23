import type { FieldModel } from '@protobase/schema'
import { badRequest } from '../problem'
import type { Deps } from '../deps'
import type { RequestAccess } from '../request-access'
import { tenantScope } from '../tenant'
import type { Row, WriteOperation } from '../types'
import type { ScheduledDelete } from './cleanup-schedule'
import type { FieldError } from '../validate-body'
import { externalFile, parseExternalUrl } from './external-url'
import { accepts, octetStream } from './media-types'
import { readTicket, type TicketScope } from './ticket'
import { baseOf, parseUri, variantPaths } from './uri'

/** The ticket scope of a caller's upload for one field. */
export const ticketScope = (access: RequestAccess, field: string): TicketScope => ({
  tenant: String(tenantScope(access.entry, access.session)?.tenantValue ?? ''),
  resource: access.entry.name,
  field,
  user: String(access.session.user.id),
})

const fileFields = (access: RequestAccess) => Object.values(access.full.fields).filter((field) => field.file)

// Why an external URL cannot be stored in a field that takes them; `undefined` when it can.
const externalRefusal = (field: FieldModel, url: URL) => {
  const type = externalFile(url).type ?? octetStream
  return accepts(field.file!.accept, type) ? undefined : `This field takes ${field.file!.accept.join(', ')}; the URL's extension gives ${type}`
}

/**
 * File values of a validated create or update body, made ready to store: a ticket from `:upload` becomes its clean URI
 * plus the derived fields it carries, `null` clears the field and its derived fields, and the stored value itself is a
 * no-op. A field with `.externalUrls()` also stores an https URL as it is, its derived fields `null`. Anything else is
 * refused, so a row can only point at a file its writer uploaded for that field, or at one elsewhere.
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
    const external = field.file!.external ? parseExternalUrl(String(value)) : undefined
    if (external) {
      const refusal = externalRefusal(field, external)
      if (refusal) {
        errors.push({ field: name, code: 'invalid-value', message: refusal })
        continue
      }
      result[name] = value
      for (const target of derive) result[target] = null
      continue
    }
    const ticket = await readTicket(files.signer, String(value), ticketScope(access, name), now)
    if (!ticket.ok || ticket.ref.provider !== field.file!.provider) {
      const expired = !ticket.ok && ticket.reason === 'expired'
      const message = expired ? 'The upload expired; upload the file again' : field.file!.external ? 'Neither a file uploaded for this field nor an https URL without credentials' : 'Not a file uploaded for this field; upload it with :upload first'
      errors.push({ field: name, code: 'invalid-value', message })
      continue
    }
    result[name] = ticket.uri
    for (const target of derive) result[target] = Object.hasOwn(ticket.derived, target) ? ticket.derived[target] : null
  }
  if (errors.length > 0) throw badRequest('invalid-record', `The request body is invalid: ${errors[0]!.field}: ${errors[0]!.message}`, { errors })
  return result
}

/**
 * The deletes of every file a write took out of its row, with its variants: a replaced or cleared value, or all of a
 * hard-deleted row's files, each due after its provider's retention. The write schedules them once it commits
 * (`scheduleRemovedFiles`).
 */
export const removedFiles = (access: RequestAccess, operation: WriteOperation, before?: Row, after?: Row): ScheduledDelete[] => {
  const files = access.deps.files
  if (!files || !before || operation === 'create' || operation === 'undelete') return []
  if (operation === 'delete' && access.full.softDelete) return []
  const now = Date.now()
  return fileFields(access).flatMap((field) => {
    const old = before[field.name]
    if (typeof old !== 'string') return []
    const next = after?.[field.name]
    if (typeof next === 'string' && baseOf(next) === baseOf(old)) return []
    const ref = parseUri(old)
    if (!ref || !files.providers[ref.provider]) return []
    const variants = Object.values(variantPaths(ref))
    return [{ provider: ref.provider, path: ref.path, due: new Date(now + files.retention(ref.provider)), ...(variants.length > 0 && { variants }) }]
  })
}

/**
 * Schedules the deletes of the files a committed write took out of its rows. After the commit, so the transaction never
 * waits on the storage; a failure leaves the files in it, never a row that points at a deleted one, and is reported,
 * since the write itself stands.
 */
export const scheduleRemovedFiles = async (deps: Pick<Deps, 'files' | 'report'>, removed: ScheduledDelete[]) => {
  if (!deps.files || removed.length === 0) return
  await deps.files.schedule.add(removed).catch(deps.report)
}
