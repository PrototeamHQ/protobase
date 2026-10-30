import type { Mailer } from '../mail/smtp-mailer'
import type { LinkedAccounts } from './linked-accounts'
import { PersonalMailError } from './personal-mail-error'
import type { PersonalMailProvider } from './personal-mail-provider'

/** The mail provider `userId` linked, of the app's `providers` in their order, with the account that holds its tokens. */
export const linkedProvider = async (accounts: LinkedAccounts, providers: PersonalMailProvider[], userId: string) => {
  const linked = await accounts.accounts(userId)
  for (const provider of providers) {
    const account = linked.find((candidate) => candidate.providerId === provider.signInProvider && provider.scopes.every((scope) => candidate.scopes.includes(scope)))
    if (account) return { provider, account }
  }
  return
}

/**
 * Mail from `userId`'s own mailbox: each message goes out through the mail provider they linked, with an access token
 * refreshed when it expired. Rejects with a `PersonalMailError` and sends nothing when they linked none (`not_linked`)
 * or the provider no longer honours the link (`link_expired`).
 */
export const personalMailer = (accounts: LinkedAccounts, providers: PersonalMailProvider[], userId: string): Mailer => ({
  send: async (message) => {
    const linked = await linkedProvider(accounts, providers, userId)
    if (!linked) throw new PersonalMailError('not_linked')
    const accessToken = await accounts.accessToken(userId, linked.account, linked.provider.id)
    await linked.provider.send(message, accessToken)
  },
})
