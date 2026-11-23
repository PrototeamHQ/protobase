import { idTokenAddress, storedScopes, type LinkedAccount } from './linked-accounts'
import { mailboxConnections } from './mailbox-connections'
import type { SenderBook } from './mail-sender'
import type { PersonalMailProvider } from './personal-mail-provider'
import { linkedMailbox } from './personal-mailer'
import type { MailSenderRow } from './sender-store'

/** An account as Better Auth's adapter reads it. */
export type StoredAccount = { id: string; providerId: string; scope?: string | null; idToken?: string | null; createdAt: Date }

/** The accounts as sending reads them, each with the address its ID token names. */
export const linkedAccountsOf = (accounts: StoredAccount[]): LinkedAccount[] =>
  accounts.map((account) => {
    const address = idTokenAddress(account.idToken)
    return { id: account.id, providerId: account.providerId, scopes: storedScopes(account.scope), createdAt: account.createdAt, ...(address && { address }) }
  })

/** `userId`'s From address rows and mailbox connections, with the address of the connection mail goes through last. */
export const senderBook = (userId: string, rows: MailSenderRow[], accounts: StoredAccount[], providers: PersonalMailProvider[]): SenderBook => {
  const linked = linkedAccountsOf(accounts)
  const ownAddress = linkedMailbox(linked, providers)?.account.address
  return { userId, rows, connections: mailboxConnections(linked, providers), ...(ownAddress && { ownAddress }) }
}
