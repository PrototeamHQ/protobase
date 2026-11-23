import type { MailMessage, SentMail } from '../mail/smtp-mailer'

/** A From address with the display name the From header shows beside it, if it has one. */
export type MailFrom = { address: string; name?: string }

/**
 * A mail provider people link their own mailbox with, through the app's sign-in provider of the same company: linking
 * asks the sign-in provider for `scopes` with `linkParams`, the sign-in account Better Auth keeps holds the tokens, and
 * `send` sends a message with its access token.
 */
export type PersonalMailProvider = {
  /** Its id, such as `gmail`, as `auth.personalMail` names it. */
  id: string
  /** The name the account page shows, such as `Gmail`. */
  name: string
  /** The sign-in provider whose account holds the tokens, such as `google`: one of the app's `socialProviders`. */
  signInProvider: string
  /** The scopes linking asks for, which the account must hold to send. */
  scopes: string[]
  /**
   * The scopes an app may add to the link for more abilities, such as reading the mailbox's send-as addresses; an app
   * names those it wants in `auth.personalMail`, and a scope not listed here stops startup.
   */
  optionalScopes: string[]
  /** The optional scopes this app adds to the link (`auth.personalMail`): none until the app names them. */
  addedScopes: string[]
  /** More authorization parameters of the link, such as those that ask for a refresh token. */
  linkParams: Record<string, string>
  /**
   * Sends `message` from the mailbox, with `from` as its From address when given, else the mailbox's own. Rejects with a `PersonalMailError` of `link_expired` when the provider refuses the
   * token, and with an error naming the status for anything else it refuses. Resolves to the `Message-ID` the recipient
   * sees when the provider can tell it.
   */
  send: (message: MailMessage, accessToken: string, from?: MailFrom) => Promise<SentMail>
  /**
   * The From addresses the mailbox may send as, each with what the provider says of it, when the provider can list
   * them; a provider without the ability leaves it out, and callers tell it by its absence. Answers `not_permitted`
   * with the scopes it lacks when the connection does not hold them, and rejects with a `PersonalMailError` of
   * `link_expired` or a `SenderListingError` when the listing fails or comes back incomplete, recording nothing.
   */
  list_sender_addresses?: (connection: ListingConnection) => Promise<SenderAddressListing>
}

/** A connected mailbox as a provider's abilities read it: a valid access token and the scopes the link holds. */
export type ListingConnection = { accessToken: string; scopes: string[] }

/** What a provider says of a listed address: `verified` when it may send as it, `pending` while its owner still has to confirm it. */
export type ProviderAddressState = 'verified' | 'pending'

/** A provider's listing: every address it lists, complete, or the scopes the connection lacks to list them. */
export type SenderAddressListing =
  | { kind: 'listed'; addresses: { address: string; provider_state?: ProviderAddressState }[] }
  | { kind: 'not_permitted'; missing_scopes: string[] }

/** Thrown when a provider's listing fails or comes back incomplete: nothing is recorded of it. */
export class SenderListingError extends Error {
  readonly code = 'listing_failed'
}
