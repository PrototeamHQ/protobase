import { isApiError } from '@protobase/client'

/** Why a message could not go out from the person's own mailbox, and the mail provider at fault when the server names one. */
export type MailboxProblem = { code: 'not_linked' | 'link_expired'; provider?: string }

const codes = new Map<string, MailboxProblem['code']>([
  ['personal-mail-not-linked', 'not_linked'],
  ['personal-mail-link-expired', 'link_expired'],
])

/** The mailbox problem a failed call answered with, as the server's personal mail reports it; none for any other failure. */
export const mailboxProblem = (error: unknown): MailboxProblem | undefined => {
  if (!isApiError(error)) return
  const code = codes.get(error.slug)
  if (!code) return
  const { provider } = error.problem
  return { code, ...(typeof provider === 'string' && { provider }) }
}
