import { stateIn, type SenderBook } from './mail-sender'
import type { SenderRowState } from './sender-address-state'
import type { MailSenderRow } from './sender-store'

/**
 * An address as the account page lists it: its `state`, `detached` for one on no connection they can send through,
 * and its `connection`, none when detached; `listedAt` when the provider's last listing held it.
 */
export type ListedMailSender = {
  id: string
  address: string
  name?: string
  signature?: string
  isDefault: boolean
  state: Exclude<SenderRowState, 'removed'>
  connection?: string
  listedAt?: string
}

/**
 * A mailbox connection as the account page lists it: its provider, its own address when the link names it, whether
 * its provider can list its send-as addresses, and the scopes the app adds to the link that it does not hold yet, so
 * connecting it again lets it list.
 */
export type ListedConnection = { id: string; provider: string; address?: string; canList: boolean; missingScopes: string[] }

export const listedSender = (book: SenderBook, row: MailSenderRow): ListedMailSender | undefined => {
  const state = stateIn(book, row)
  if (state === 'removed') return
  return {
    id: row.id,
    address: row.address,
    ...(row.name && { name: row.name }),
    ...(row.signature && { signature: row.signature }),
    isDefault: row.isDefault,
    state,
    ...(state !== 'detached' && row.connectionId && { connection: row.connectionId }),
    ...(row.listedAt && { listedAt: new Date(row.listedAt).toISOString() }),
  }
}

/** The person's addresses and connections, as `GET /account/mail-senders` answers them. */
export const listedMailSenders = (book: SenderBook) => ({
  ...(book.ownAddress && { address: book.ownAddress }),
  senders: book.rows.flatMap((row) => listedSender(book, row) ?? []),
  connections: book.connections.map(({ account, provider }): ListedConnection => ({
    id: account.id,
    provider: provider.id,
    ...(account.address && { address: account.address }),
    canList: Boolean(provider.list_sender_addresses),
    missingScopes: provider.addedScopes.filter((scope) => !account.scopes.includes(scope)),
  })),
})
