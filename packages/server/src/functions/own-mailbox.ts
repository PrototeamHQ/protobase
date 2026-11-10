import { ownSignInUser } from '../notifications/caller'
import type { PersonalMail } from '../personal-mail/personal-mailer'
import type { Session } from '../types'

const purpose = 'send mail from their own mailbox'

/**
 * The caller's own mailbox: mail goes out from it, and its senders are read, only for someone signed in as themselves.
 * Staff signed in as them, an outside app acting for them and a visitor are refused with a 403 problem, sending nothing.
 */
export const ownMailbox = (session: Session, personalMailer: (userId: string) => PersonalMail): PersonalMail => ({
  send: async (message) => personalMailer(ownSignInUser(session, purpose)).send(message),
  sender: async (from) => personalMailer(ownSignInUser(session, purpose)).sender(from),
  senders: async () => personalMailer(ownSignInUser(session, purpose)).senders(),
})
