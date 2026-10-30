import { HttpProblem } from '../problem'

/**
 * Why a message cannot go out from someone's own mailbox: `not_linked`, they linked no mail provider of the app's, or
 * linked the sign-in account without allowing it to send mail; `link_expired`, the provider no longer honours the
 * link, as when they revoked it or its refresh token expired, so they link it again.
 */
export type PersonalMailErrorCode = 'not_linked' | 'link_expired'

const details: Record<PersonalMailErrorCode, string> = {
  not_linked: 'Link a mailbox to send mail from it',
  link_expired: 'The link to your mailbox has expired: link it again to send mail from it',
}

/**
 * Thrown when a message cannot go out from someone's own mailbox, and nothing was sent. Out of a function it answers as
 * a 409 problem whose `code` and `provider` say which, so the app can offer to link the mailbox; in code,
 * `error instanceof PersonalMailError` and its `code` tell.
 */
export class PersonalMailError extends HttpProblem {
  constructor(
    readonly code: PersonalMailErrorCode,
    /** The mail provider at fault, such as `gmail`; none when nothing is linked. */
    readonly provider?: string,
  ) {
    super(409, `personal-mail-${code.replace('_', '-')}`, 'Conflict', details[code], { code, ...(provider && { provider }) })
  }
}
