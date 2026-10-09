import { forbidden } from './problem'
import type { Entry } from './registry'
import type { Session } from './types'

/** The query-layer scope for the caller; a tenant-scoped resource without a tenant is refused. */
export const tenantScope = (entry: Entry, session: Session) => {
  if (!entry.model.tenant) return undefined
  if (session.tenant === undefined) throw forbidden('tenant-required', `Resource "${entry.name}" is tenant-scoped and the caller has no tenant`)
  return { tenantValue: session.tenant }
}
