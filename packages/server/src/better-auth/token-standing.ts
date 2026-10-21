import type { JWTPayload } from 'jose'
import { unauthorized } from '../problem'
import { effectiveRoles, globalRoles } from './organizations/app-roles'
import { noGlobalRole } from './organizations/role-definitions'
import { findMember, findOrganization, type AuthContext } from './organizations/store'
import { parseRoles } from './parse-roles'

type StandingUser = { id: string; role?: string | null; banned?: boolean | null; banExpires?: Date | null }
type StandingSession = { userId: string; expiresAt: Date }

/** What a verified token claims: its user, its session (`sid`, absent on tokens from `issueToken`), roles and organization. */
export type TokenClaims = { userId: string; sessionId?: string; roles: readonly string[]; organizationId?: string }

export const tokenClaims = (payload: JWTPayload, roles: readonly string[], tenant: unknown): TokenClaims => ({
  userId: payload.sub!,
  ...(typeof payload.sid === 'string' && { sessionId: payload.sid }),
  roles: roles.filter((role) => role !== noGlobalRole),
  ...(typeof tenant === 'string' && { organizationId: tenant }),
})

const revoked = () => unauthorized('The bearer token was revoked: get a new one')

const bannedNow = (user: StandingUser, now: Date) => Boolean(user.banned) && (!user.banExpires || user.banExpires > now)

// The roles the user holds where the token works: globally, and in its organization as a member; `undefined` when
// they may no longer work in that organization at all.
const heldWhere = async ({ adapter }: AuthContext, user: StandingUser, organizations: boolean, organizationId?: string) => {
  if (!organizations) return parseRoles(user.role)
  const global = globalRoles(user.role)
  if (!organizationId) return global
  const member = await findMember(adapter, { organizationId, userId: user.id })
  if (member) return effectiveRoles(global, member.appRoles)
  return global.length > 0 && (await findOrganization(adapter, organizationId)) !== null ? global : undefined
}

/**
 * Whether a token still stands, read from the store on every request: its user exists and is not banned, its session
 * is not signed out or expired, and each role it carries is one the user still holds there. A token that fails is a
 * 401, so the client asks its session for a new one, which carries the roles as they are now or is refused.
 */
export const checkTokenStanding = async (context: AuthContext, claims: TokenClaims, organizations: boolean, now = new Date()) => {
  const { adapter } = context
  if (claims.sessionId !== undefined) {
    const session = await adapter.findOne<StandingSession>({ model: 'session', where: [{ field: 'id', value: claims.sessionId }] })
    if (!session || session.userId !== claims.userId || session.expiresAt <= now) throw revoked()
  }
  const user = await adapter.findOne<StandingUser>({ model: 'user', where: [{ field: 'id', value: claims.userId }] })
  if (!user || bannedNow(user, now)) throw revoked()
  const held = await heldWhere(context, user, organizations, claims.organizationId)
  if (!held || claims.roles.some((role) => !held.includes(role))) throw revoked()
}
