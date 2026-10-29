import { forbidden } from '../problem'
import type { Session } from '../types'

/**
 * The id of the user whose devices and notification history a request may reach: only someone signed in as themselves.
 * Refused: visitors, outside apps acting for the user (an MCP client), and every session whose authenticator does not
 * mark it as the user's own sign-in (`Session.signIn`), staff signed in as the user included.
 */
export const ownSignInUser = (session: Session, what = 'reach their devices and notifications') => {
  const refuse = () => forbidden('own-sign-in-only', `Only someone signed in as themselves can ${what}`)
  if (session.anonymous || session.client || session.signIn?.staff !== false) throw refuse()
  const userId = String(session.user.id)
  if (userId === '' || session.user.id === undefined || session.user.id === null) throw refuse()
  return userId
}

/**
 * The caller of a device request: `ownSignInUser`'s user, and the id of the session they signed in with, when their
 * authenticator names one. With `sessionRequired`, as with Protobase's auth, whose devices get push only while their
 * session stands, a caller without one is refused too.
 */
export const ownSignInDevice = (session: Session, sessionRequired: boolean) => {
  const userId = ownSignInUser(session)
  const sessionId = session.signIn?.session
  if (sessionRequired && (typeof sessionId !== 'string' || sessionId === '')) throw forbidden('own-sign-in-only', 'Only someone signed in as themselves can reach their devices and notifications')
  return { userId, sessionId: typeof sessionId === 'string' && sessionId !== '' ? sessionId : null }
}
