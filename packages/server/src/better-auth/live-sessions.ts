import type { AdminAuth } from './create-auth'
import type { AuthContext } from './organizations/store'

type SessionRow = { id: string; userId: string; expiresAt: Date }
type UserRow = { id: string; banned?: boolean | null; banExpires?: Date | null }

// A ban stands while it has no end or its end is still to come.
const isBanned = (user: UserRow, now: Date) => user.banned === true && (user.banExpires === null || user.banExpires === undefined || new Date(user.banExpires) > now)

/**
 * Which of the sessions with these ids still stand, read from the store: each live one's id with its user's id. A
 * session signed out, revoked, ended by a newer sign-in in the same browser, or expired is not among them, nor one
 * whose user is banned: a ban deletes the user's sessions, and is read here too, so a session it left still ends.
 * Reads by the session's id, never its token.
 */
export const liveSessionsIn = async (context: Pick<AuthContext, 'adapter'>, ids: readonly string[], now = new Date()) => {
  const live = new Map<string, string>()
  if (ids.length === 0) return live
  const rows = await context.adapter.findMany<SessionRow>({ model: 'session', where: [{ field: 'id', operator: 'in', value: [...ids] }] })
  const standing = rows.filter((row) => ids.includes(row.id) && new Date(row.expiresAt) > now)
  if (standing.length === 0) return live
  const userIds = [...new Set(standing.map((row) => String(row.userId)))]
  const users = await context.adapter.findMany<UserRow>({ model: 'user', where: [{ field: 'id', operator: 'in', value: userIds }] })
  const allowed = new Set(users.filter((user) => !isBanned(user, now)).map((user) => String(user.id)))
  for (const row of standing) if (allowed.has(String(row.userId))) live.set(row.id, String(row.userId))
  return live
}

/** `liveSessionsIn` on the store of this Better Auth instance. */
export const liveSessions = (auth: AdminAuth) => async (ids: readonly string[]) => liveSessionsIn((await auth.$context) as unknown as AuthContext, ids)
