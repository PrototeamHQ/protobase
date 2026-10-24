import { forbidden } from '../problem'
import type { Session } from '../types'

/**
 * The id of the user whose devices a request may register and remove: only someone signed in as themselves. Refused:
 * visitors, outside apps acting for the user (an MCP client), and every session whose authenticator does not mark it as
 * the user's own sign-in (`Session.signIn`), staff signed in as the user included.
 */
export const ownDeviceUser = (session: Session) => {
  const refuse = () => forbidden('own-sign-in-only', 'Only someone signed in as themselves can change their devices')
  if (session.anonymous || session.client || session.signIn?.staff !== false) throw refuse()
  const userId = String(session.user.id)
  if (userId === '' || session.user.id === undefined || session.user.id === null) throw refuse()
  return userId
}
