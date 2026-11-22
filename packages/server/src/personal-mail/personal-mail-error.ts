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

// The owner of a shared address is not named: the sender may send from it, nothing more.
const othersDetails: Record<PersonalMailErrorCode, (address: string) => string> = {
  not_linked: (address) => `The person who shared ${address} must link their mailbox again to send mail from it`,
  link_expired: (address) => `The link to the mailbox of the person who shared ${address} has expired: they must link it again to send mail from it`,
}

/** The mailbox at fault is another person's, who shared `address`: they, not the sender, link it again. */
export type OthersMailbox = { owner: 'other'; address: string }

/**
 * Thrown when a message cannot go out from someone's own mailbox, and nothing was sent. Out of a function it answers as
 * a 409 problem whose `code` and `provider` say which, so the app can offer to link the mailbox; in code,
 * `error instanceof PersonalMailError` and its `code` tell. For an address another person shared (`other`), the problem
 * says `owner: 'other'` and the `address`, and neither the provider nor anything else of theirs, so the app tells the
 * sender that the owner must link their mailbox again rather than offering to link the sender's own.
 */
export class PersonalMailError extends HttpProblem {
  constructor(
    readonly code: PersonalMailErrorCode,
    /** The mail provider at fault, such as `gmail`; none when nothing is linked, or the mailbox is another's. */
    readonly provider?: string,
    readonly other?: OthersMailbox,
  ) {
    const detail = other ? othersDetails[code](other.address) : details[code]
    super(409, `personal-mail-${code.replace('_', '-')}`, 'Conflict', detail, other ? { code, ...other } : { code, ...(provider && { provider }) })
  }
}
