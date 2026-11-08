import type { PersonalMailLink } from '@protobase/client'
import type { MailboxProblem } from './mailbox-problem'

/**
 * A mailbox the person can connect: `again` when they linked it before and the link needs renewing, and `signInOnly`
 * when they sign in with its provider, such as Google, without having allowed it to send mail.
 */
export type MailboxOffer = { link: PersonalMailLink; again: boolean; signInOnly: boolean }

/** What the person's account holds: the mail providers linked with leave to send (`mail`), and the sign-in providers linked (`providers`). */
export type LinkedAccounts = { mail: string[]; providers: string[] }

/**
 * The mailboxes to offer for `problem`, or before a send while none is linked (no `problem`): an expired link offers its
 * provider's mailbox again, or every one when the server named none; a missing one offers each the app has.
 */
export const mailboxOffers = (links: PersonalMailLink[], linked: LinkedAccounts, problem?: MailboxProblem): MailboxOffer[] => {
  if (problem?.code === 'link_expired') {
    const named = links.filter((link) => link.id === problem.provider)
    return (named.length > 0 ? named : links).map((link) => ({ link, again: true, signInOnly: false }))
  }
  if (!problem && linked.mail.length > 0) return []
  return links.map((link) => {
    const again = linked.mail.includes(link.id)
    return { link, again, signInOnly: !again && linked.providers.includes(link.provider) }
  })
}
