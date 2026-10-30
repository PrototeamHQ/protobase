import type { Mailer } from '../mail/smtp-mailer'
import { ownSignInUser } from '../notifications/caller'
import type { Session } from '../types'

/**
 * The caller's own mailbox: mail goes out from it only for someone signed in as themselves. Staff signed in as them,
 * an outside app acting for them and a visitor are refused with a 403 problem, sending nothing.
 */
export const ownMailbox = (session: Session, personalMailer: (userId: string) => Mailer): Mailer => ({
  send: async (message) => personalMailer(ownSignInUser(session, 'send mail from their own mailbox')).send(message),
})
