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
 * whose mailbox it goes out through, none for an address someone else shared (`shared`); its own `signature`, if it
 * has one; and its `state` (`SenderAddressState`). The mailbox's own address is `verified`: the provider's sign-in
 * vouches for it, as a shared one is only while its owner's evidence says so.
 */
export type MailSender = { id: string | null; address?: string; name?: string; ownerId?: string; shared?: true; signature?: string; state: SenderAddressState }

/**
 * The person's rows and connections, and what the app's verifiers proved of the rows, as resolving a From address reads
 * them; with `shared`, the verified addresses others shared with them.
 */
export type SenderBook = { userId: string; rows: MailSenderRow[]; connections: MailboxConnection[]; ownAddress?: string; proofs?: SenderProof[]; shared?: MailSenderRow[] }

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

const sharedSender = (row: MailSenderRow): MailSender => ({
  id: row.id,
  address: row.address,
  ...(row.name && { name: row.name }),
  shared: true,
  ...(row.signature && { signature: row.signature }),
  state: 'verified',
})

const mailboxSender = (book: SenderBook): MailSender => ({ id: null, ...(book.ownAddress && { address: book.ownAddress }), ownerId: book.userId, state: 'verified' })

const sameAddress = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * The sender `book`'s person sends as for `address`, matched without regard to case: one of their usable records;
 * else their mailbox's own address; else one someone else shared with them (`book.shared`). Without `address`, their
 * default record, else their mailbox's own. Refuses with `MailSenderRefusedError` any other address, one someone else
 * entered and did not share included, and with `sender_address_ambiguous` one that is a record on more than one of
 * their connections, or shared by more than one person.
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
  const shared = (book.shared ?? []).filter((row) => sameAddress(row.address, address))
  if (shared.length > 1) throw new SenderAddressError('sender_address_ambiguous')
  if (shared[0]) return sharedSender(shared[0])
  throw new MailSenderRefusedError(address)
}

/**
 * Every sender the person may choose: their mailbox's own address, when the link names it and no record holds it, then
 * their records, then the addresses others shared with them that none of theirs holds.
 */
export const usableSenders = (book: SenderBook): MailSender[] => {
  const usable = usableRows(book)
  const own = book.ownAddress && !usable.some(({ row }) => sameAddress(row.address, book.ownAddress!)) ? [mailboxSender(book)] : []
  const theirs = [...own, ...usable.map(({ row, state }) => senderOf(row, state))]
  const shared = (book.shared ?? []).filter((row) => !theirs.some((sender) => sender.address && sameAddress(sender.address, row.address)))
  return [...theirs, ...shared.map(sharedSender)]
}
