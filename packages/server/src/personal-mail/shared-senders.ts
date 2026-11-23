import { storedScopes } from './linked-accounts'
import { mailboxConnections } from './mailbox-connections'
import type { PersonalMailProvider } from './personal-mail-provider'
import { senderRowState } from './sender-address-state'
import type { SharedSenderRow } from './shared-sender-store'

/** An address someone else shared, as the person sees it: never its owner, nor the mailbox it goes out through. */
export type SharedSender = { id: string; address: string; name?: string }

/** The connection a shared address goes out through: its owner's account, while that still holds a provider's send scopes. */
export const sharedConnection = ({ account }: SharedSenderRow, providers: PersonalMailProvider[]) =>
  account ? mailboxConnections([{ id: account.id, providerId: account.providerId, scopes: storedScopes(account.scope), createdAt: account.createdAt }], providers)[0] : undefined

/** The state of a shared address, derived as for its owner (`senderRowState`): only a `verified` one goes out. */
export const sharedState = (row: SharedSenderRow, providers: PersonalMailProvider[]) => senderRowState(row, sharedConnection(row, providers) !== undefined, row.provedAt ?? undefined)

/** The shared addresses the person may send from: those still verified. */
export const usableShared = (rows: SharedSenderRow[], providers: PersonalMailProvider[]) => rows.filter((row) => sharedState(row, providers) === 'verified')

export const listedShared = ({ id, address, name }: SharedSenderRow): SharedSender => ({ id, address, ...(name && { name }) })
