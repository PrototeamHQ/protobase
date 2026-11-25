import type { Organization, ScopedTables } from '@protobase/query'
import { keptNamesOf, type PinRead } from '../better-auth/organizations/kept-organizations'
import type { ResolvedNames } from '../better-auth/names/resolve-names'
import type { Session } from '../types'
import { noOrganizationTables, organizationTables, sessionOrganization } from './organization-tables'

/**
 * The scope the app's own code works in, its functions, jobs and hooks: the tables whose rows belong to one
 * organization, the organization work about none works in (`pinned`), and the one a signed-in session works in.
 */
export type AppScope = { tables: ScopedTables; pinned: Organization; organizationOf: (session: Session | undefined) => Organization }

/** What the scope reads of sign-in: whether organizations are on, the store's names, and the organization pinned while they are off. */
export type AppScopeInput = { organizations: boolean; names: ResolvedNames | undefined; pinned?: PinRead | undefined }

const unscoped: AppScope = { tables: noOrganizationTables, pinned: undefined, organizationOf: () => undefined }

/**
 * The app's scope, read once the store says whether organizations were on. With organizations on, the session's
 * active organization. While they are off after being on, the tables they kept, under their names with organizations
 * on, and the pinned organization, for work about none and for a session of it, whose `tenant` is its id; a session
 * of another tenant, such as an outside app's, works in none. An app that never had organizations scopes nothing.
 */
export const appScope = ({ organizations, names, pinned }: AppScopeInput): (() => Promise<AppScope>) => {
  if (organizations) {
    const on: AppScope = { tables: organizationTables(names), pinned: undefined, organizationOf: sessionOrganization }
    return async () => on
  }
  const kept = names && pinned && keptNamesOf(names)
  if (!kept) return async () => unscoped
  const tables = organizationTables(kept)
  return async () => {
    const pin = await pinned!()
    if (!pin) return unscoped
    return { tables, pinned: pin.id, organizationOf: (session) => (session?.tenant === pin.id ? pin.id : undefined) }
  }
}
