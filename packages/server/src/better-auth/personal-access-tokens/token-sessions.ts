import { unauthorized } from '../../problem'
import type { Session, TenantValue } from '../../types'
import type { AuthContext } from '../organizations/store'
import { noGlobalRole } from '../organizations/role-definitions'
import { checkUserStanding } from '../token-standing'
import { isWellFormed, tokenHash } from './token-format'
import { findTokenByHash, noteUse } from './token-store'

export type PersonalAccessTokenSessionsInput = {
  prefix: string
  /** The auth store, read on every request. */
  context: () => Promise<AuthContext>
  organizations: boolean
  /** The one tenant everyone works in, for an app without organizations. */
  tenant?: TenantValue | (() => Promise<TenantValue | undefined>)
}

/** The bearer token of a request, when it has this app's prefix; anything else is left to the app's other tokens. */
export const personalAccessTokenOf = (request: Request, prefix: string) => {
  const [scheme, token, ...rest] = (request.headers.get('authorization') ?? '').split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token || rest.length > 0 || !token.startsWith(prefix)) return undefined
  return token
}

/** A token's session, with the token's id and when it expires, in seconds since the epoch (`Infinity` for never). */
export type PersonalAccessTokenSession = { session: Session; id: string; expiresAt: number }

const refused = () => unauthorized('The personal access token is invalid, expired or revoked')

/**
 * The session of a personal access token, read from the store on every request: a token whose checksum fails is
 * refused before any lookup, then one that is unknown (never made, or revoked) or expired. Its user must still stand
 * as a token's does (`checkUserStanding`): exist, not be banned, and still hold the token's role where it works, in its
 * organization with organizations on. The session has that one role and organization, as a token of the session that
 * made it would, and no `signIn`, so what only the person's own sign-in may do is refused. Use is noted at most once a
 * minute (`noteUse`).
 */
export const personalAccessTokenSessions = ({ prefix, context, organizations, tenant }: PersonalAccessTokenSessionsInput) => async (token: string, now = new Date()): Promise<PersonalAccessTokenSession> => {
  if (!isWellFormed(token, prefix)) throw refused()
  const store = await context()
  const row = await findTokenByHash(store.adapter, await tokenHash(token))
  if (!row || (row.expiresAt && new Date(row.expiresAt) <= now)) throw refused()
  const organizationId = organizations ? (row.organizationId ?? undefined) : undefined
  const organizationRole = await checkUserStanding(store, { userId: row.userId, roles: [row.role], ...(organizationId && { organizationId }) }, organizations, now)
  await noteUse(store.adapter, row, now)
  const roles = [row.role].filter((role) => role !== noGlobalRole)
  const tenantValue = tenant === undefined ? organizationId : typeof tenant === 'function' ? await tenant() : tenant
  const session: Session = {
    user: { id: row.userId, roles },
    ...(tenantValue !== undefined && { tenant: tenantValue }),
    ...(organizationId !== undefined && { organization: { id: organizationId, ...(organizationRole && { role: organizationRole }) } }),
  }
  return { session, id: row.id, expiresAt: row.expiresAt ? Math.floor(new Date(row.expiresAt).getTime() / 1000) : Number.POSITIVE_INFINITY }
}
