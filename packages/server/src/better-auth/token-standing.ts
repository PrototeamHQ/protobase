import type { JWTPayload } from 'jose'
import { unauthorized } from '../problem'
import type { Session } from '../types'
import { effectiveRoles, globalRoles } from './organizations/app-roles'
import { noGlobalRole } from './organizations/role-definitions'
import { findMember, findOrganization, type AuthContext } from './organizations/store'
import { parseRoles } from './parse-roles'
import { isStaffSession } from './staff-checks'
import { strongSignInAt } from './strong-sign-ins'

type StandingUser = { id: string; role?: string | null; banned?: boolean | null; banExpires?: Date | null }
type StandingSession = { userId: string; expiresAt: Date; impersonatedBy?: string | null }

/**
 * The sign-in a session row stands for: staff started it when the admin plugin's `impersonatedBy` names someone. A row
 * read without that field gives `undefined`, so a caller who cannot be told apart from staff is never taken for the user.
 */
export const signInOf = (session: StandingSession, id: string) =>
  'impersonatedBy' in session && session.impersonatedBy !== undefined ? { session: id, staff: isStaffSession(session) } : undefined

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
 * Whether a token's user still stands, read from the store: they exist and are not banned, and each role the token
 * carries is one they still hold where it works. The part of `checkTokenStanding` an MCP access token gets, whose
 * grant outlives the browser session that made it.
 */
export const checkUserStanding = async (context: AuthContext, claims: Omit<TokenClaims, 'sessionId'>, organizations: boolean, now = new Date()) => {
  const user = await context.adapter.findOne<StandingUser>({ model: 'user', where: [{ field: 'id', value: claims.userId }] })
  if (!user || bannedNow(user, now)) throw revoked()
  const held = await heldWhere(context, user, organizations, claims.organizationId)
  if (!held || claims.roles.some((role) => !held.includes(role))) throw revoked()
}

/**
 * Whether a token still stands, read from the store on every request: its session is not signed out or expired, and
 * its user still stands (`checkUserStanding`). A token that fails is a 401, so the client asks its session for a new
 * one, which carries the roles as they are now or is refused. Answers the sign-in the token's session stands for
 * (`signInOf`), `undefined` for a token without one; the user's own one also reads, when asked, when it last proved a
 * passkey or a second step (`strongSignInAt`).
 */
export const checkTokenStanding = async (context: AuthContext, claims: TokenClaims, organizations: boolean, now = new Date()): Promise<Session['signIn']> => {
  const session = claims.sessionId === undefined ? undefined : await context.adapter.findOne<StandingSession>({ model: 'session', where: [{ field: 'id', value: claims.sessionId }] })
  if (claims.sessionId !== undefined && (!session || session.userId !== claims.userId || session.expiresAt <= now)) throw revoked()
  await checkUserStanding(context, claims, organizations, now)
  const signIn = session ? signInOf(session, claims.sessionId!) : undefined
  if (!signIn || signIn.staff) return signIn
  return { ...signIn, strongAt: () => strongSignInAt(context.internalAdapter, claims.sessionId!) }
}
