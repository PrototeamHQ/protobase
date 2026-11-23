import { HttpProblem } from '../problem'

/**
 * Why a message names a From address it cannot go out from, sending nothing: `failed`, the mailbox's provider says it
 * cannot send as it; `pending`, its owner has not confirmed it with the provider yet; `detached`, it is on no mailbox
 * connection its owner can send through; `ambiguous`, an address or the mailbox's own stands for more than one of them;
 * `owner_unlinked`, an address someone else shared goes out through a mailbox of theirs that they must connect again.
 */
export type SenderAddressErrorCode = 'sender_address_failed' | 'sender_address_pending' | 'sender_address_detached' | 'sender_address_ambiguous' | 'sender_address_owner_unlinked'

const details: Record<SenderAddressErrorCode, string> = {
  sender_address_failed: 'Your mailbox cannot send as this address: set it up with your mail provider, or choose another',
  sender_address_pending: 'This address still waits for you to confirm it with your mail provider',
  sender_address_detached: 'This address is on no mailbox you have connected: add it again under Account → Mailbox',
  sender_address_ambiguous: 'This address is on more than one of your mailboxes: choose the From address by its id',
  sender_address_owner_unlinked: 'This address belongs to someone else, who must connect their mailbox again before mail goes out from it',
}

/** Thrown when a send names a From address it cannot go out from; it answers as a 409 problem whose `code` says why. */
export class SenderAddressError extends HttpProblem {
  constructor(readonly code: SenderAddressErrorCode) {
    super(409, code.replaceAll('_', '-'), 'Conflict', details[code], { code })
  }
}

/**
 * Thrown when a send names a From address id that is not one of the sender's: unknown, removed, or someone else's and
 * not shared with them, or no longer verified, in the same words, so the answer does not tell which. It answers as a 404 problem.
 */
export class SenderAddressNotFoundError extends HttpProblem {
  constructor() {
    super(404, 'sender-address-not-found', 'Not Found', 'This From address is not one of yours')
  }
}
