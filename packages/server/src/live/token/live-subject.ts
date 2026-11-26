import type { Session } from '../../types'
import type { LiveSubject } from './live-token'

/** How long a token lasts at most: a visitor's always, longer than the API lets anyone cache a response (it lets none). */
export const liveTokenSeconds = 3600

/**
 * Whom a live token is for: a visitor, unbound, for `liveTokenSeconds`; a person signed in with a session of the app,
 * bound to it until it ends, at most `liveTokenSeconds`. Undefined for any other caller, such as an API key or an
 * outside app, and for a session that has ended: they get no token.
 */
export const liveSubject = async (session: Session, sessionEnd: (id: string) => Promise<Date | undefined>, now = new Date()): Promise<LiveSubject | undefined> => {
  const longest = new Date(now.getTime() + liveTokenSeconds * 1000)
  if (session.anonymous) return { anonymous: true, expiresAt: longest }
  const id = session.signIn?.session
  if (session.client || typeof id !== 'string' || id === '') return
  const end = await sessionEnd(id)
  if (!end || end.getTime() <= now.getTime()) return
  return { user: String(session.user.id), session: id, expiresAt: end < longest ? end : longest }
}
