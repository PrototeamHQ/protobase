import type { MailMessage } from '../mail/smtp-mailer'

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
  /** More authorization parameters of the link, such as those that ask for a refresh token. */
  linkParams: Record<string, string>
  /**
   * Sends `message` from the mailbox. Rejects with a `PersonalMailError` of `link_expired` when the provider refuses the
   * token, and with an error naming the status for anything else it refuses.
   */
  send: (message: MailMessage, accessToken: string) => Promise<void>
}
