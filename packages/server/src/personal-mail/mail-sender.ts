import { MailSenderRefusedError } from './mail-sender-refused'
import type { MailboxConnection } from './mailbox-connections'
import { SenderAddressError } from './sender-address-error'
import { senderRowState, type SenderAddressState } from './sender-address-state'
import type { MailSenderRow } from './sender-store'
import type { SenderProof } from './verifiers/verification-store'

/**
 * A From address someone may send mail from: `id`, the record a send names (`sender_address_id`), null for the
 * mailbox's own address, which goes out with no From header, so the provider fills in its own; `address`, unknown
 * when it is the mailbox's own and the link does not name it; the display `name` its owner entered, if any; `ownerId`,
 * whose mailbox it goes out through; its own `signature`, if it has one; and its `state` (`SenderAddressState`). The
 * mailbox's own address is `verified`: the provider's sign-in vouches for it.
 */
export type MailSender = { id: string | null; address?: string; name?: string; ownerId: string; signature?: string; state: SenderAddressState }

/** The person's rows and connections, and what the app's verifiers proved of the rows, as resolving a From address reads them. */
export type SenderBook = { userId: string; rows: MailSenderRow[]; connections: MailboxConnection[]; ownAddress?: string; proofs?: SenderProof[] }

const connected = (book: SenderBook, row: MailSenderRow) => book.connections.some(({ account }) => account.id === row.connectionId)

/** The state of a row of `book`'s (`senderRowState`). */
export const stateIn = (book: SenderBook, row: MailSenderRow) => senderRowState(row, connected(book, row), book.proofs?.find(({ senderId }) => senderId === row.id)?.settledAt)

/** The rows a person may choose: neither removed nor detached, oldest first. */
export const usableRows = (book: SenderBook) =>
  book.rows.flatMap((row) => {
    const state = stateIn(book, row)
    return state === 'removed' || state === 'detached' ? [] : [{ row, state }]
  })

export const senderOf = (row: MailSenderRow, state: SenderAddressState): MailSender => ({
  id: row.id,
  address: row.address,
  ...(row.name && { name: row.name }),
  ownerId: row.userId,
  ...(row.signature && { signature: row.signature }),
  state,
})

const mailboxSender = (book: SenderBook): MailSender => ({ id: null, ...(book.ownAddress && { address: book.ownAddress }), ownerId: book.userId, state: 'verified' })

const sameAddress = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * The sender `book`'s person sends as for `address`, matched without regard to case: one of their usable records;
 * else their mailbox's own address. Without `address`, their default record, else their mailbox's own. Refuses with
 * `MailSenderRefusedError` any other address, one someone else entered included, and with `sender_address_ambiguous`
 * one that is a record on more than one of their connections.
 */
export const chooseSender = (book: SenderBook, address?: string): MailSender => {
  const usable = usableRows(book)
  if (address === undefined) {
    const chosen = usable.find(({ row }) => row.isDefault)
    return chosen ? senderOf(chosen.row, chosen.state) : mailboxSender(book)
  }
  const matching = usable.filter(({ row }) => sameAddress(row.address, address))
  if (matching.length > 1) throw new SenderAddressError('sender_address_ambiguous')
  if (matching[0]) return senderOf(matching[0].row, matching[0].state)
  if (book.ownAddress && sameAddress(book.ownAddress, address)) return mailboxSender(book)
  throw new MailSenderRefusedError(address)
}

/** Every sender the person may choose: their mailbox's own address, when the link names it and no record holds it, then their records. */
export const usableSenders = (book: SenderBook): MailSender[] => {
  const usable = usableRows(book)
  const own = book.ownAddress && !usable.some(({ row }) => sameAddress(row.address, book.ownAddress!)) ? [mailboxSender(book)] : []
  return [...own, ...usable.map(({ row, state }) => senderOf(row, state))]
}
