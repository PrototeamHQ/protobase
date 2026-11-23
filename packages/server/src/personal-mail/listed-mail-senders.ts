import { stateIn, type SenderBook } from './mail-sender'
import type { SenderRowState } from './sender-address-state'
import type { MailSenderRow } from './sender-store'
import type { VerificationRow } from './verifiers/verification-store'

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
  /** The latest verification by each of the app's verifiers, when it has any. */
  verifications?: ListedVerification[]
}

/**
 * A verification as the account page lists it: pending until `expiresAt`, verified until `validUntil`, or failed with
 * an `errorCode` and the verifier's `error` text, which is data, shown as plain text.
 */
export type ListedVerification = {
  verifier: string
  state: VerificationRow['state']
  expiresAt?: string
  settledAt?: string
  validUntil?: string
  errorCode?: string
  error?: string
}

const iso = (at: Date | string) => new Date(at).toISOString()

export const listedVerification = (row: VerificationRow): ListedVerification => ({
  verifier: row.verifier,
  state: row.state,
  ...(row.state === 'pending' && { expiresAt: iso(row.expiresAt) }),
  ...(row.settledAt && { settledAt: iso(row.settledAt) }),
  ...(row.validUntil && { validUntil: iso(row.validUntil) }),
  ...(row.errorCode && { errorCode: row.errorCode }),
  ...(row.error && { error: row.error }),
})

/**
 * A mailbox connection as the account page lists it: its provider, its own address when the link names it, whether
 * its provider can list its send-as addresses, and the scopes the app adds to the link that it does not hold yet, so
 * connecting it again lets it list.
 */
export type ListedConnection = { id: string; provider: string; address?: string; canList: boolean; missingScopes: string[] }

/** `row` as the account page lists it, with its latest `verifications` when the app has verifiers. */
export const listedSender = (book: SenderBook, row: MailSenderRow, verifications?: VerificationRow[]): ListedMailSender | undefined => {
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
    ...(verifications && { verifications: verifications.filter(({ senderId }) => senderId === row.id).map(listedVerification) }),
  }
}

/** The person's addresses and connections, as `GET /account/mail-senders` answers them, with their latest `verifications` when the app has verifiers. */
export const listedMailSenders = (book: SenderBook, verifications?: VerificationRow[]) => ({
  ...(book.ownAddress && { address: book.ownAddress }),
  senders: book.rows.flatMap((row) => listedSender(book, row, verifications) ?? []),
  connections: book.connections.map(({ account, provider }): ListedConnection => ({
    id: account.id,
    provider: provider.id,
    ...(account.address && { address: account.address }),
    canList: Boolean(provider.list_sender_addresses),
    missingScopes: provider.addedScopes.filter((scope) => !account.scopes.includes(scope)),
  })),
})
