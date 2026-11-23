import type { LinkedAccount } from './linked-accounts'
import type { PersonalMailProvider } from './personal-mail-provider'

/** A mailbox connection: one of the person's linked accounts that holds a mail provider's send scopes, with that provider. */
export type MailboxConnection = { account: LinkedAccount; provider: PersonalMailProvider }

/** The connections among `linked`, each account with the first of `providers` whose send scopes it holds. */
export const mailboxConnections = (linked: LinkedAccount[], providers: PersonalMailProvider[]): MailboxConnection[] =>
  linked.flatMap((account) => {
    const provider = providers.find((candidate) => candidate.signInProvider === account.providerId && candidate.scopes.every((scope) => account.scopes.includes(scope)))
    return provider ? [{ account, provider }] : []
  })
