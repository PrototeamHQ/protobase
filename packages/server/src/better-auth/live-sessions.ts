import type { AdminAuth } from './create-auth'
import type { AuthContext } from './organizations/store'

type SessionRow = { id: string; userId: string; expiresAt: Date }

/**
 * Which of the sessions with these ids still stand, read from the store: each live one's id with its user's id. A
 * session signed out, revoked, ended by a ban or a newer sign-in in the same browser, or expired is not among them.
 * Reads by the session's id, never its token.
 */
export const liveSessionsIn = async (context: Pick<AuthContext, 'adapter'>, ids: readonly string[], now = new Date()) => {
  const live = new Map<string, string>()
  if (ids.length === 0) return live
  const rows = await context.adapter.findMany<SessionRow>({ model: 'session', where: [{ field: 'id', operator: 'in', value: [...ids] }] })
  for (const row of rows) if (ids.includes(row.id) && new Date(row.expiresAt) > now) live.set(row.id, String(row.userId))
  return live
}

/** `liveSessionsIn` on the store of this Better Auth instance. */
export const liveSessions = (auth: AdminAuth) => async (ids: readonly string[]) => liveSessionsIn((await auth.$context) as unknown as AuthContext, ids)
