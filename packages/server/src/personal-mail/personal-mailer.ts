import type { MailMessage, SentMail } from '../mail/smtp-mailer'
import type { LinkedAccount, LinkedAccounts } from './linked-accounts'
import { chooseSender, usableSenders, type MailSender, type SenderBook } from './mail-sender'
import { mailboxConnections, type MailboxConnection } from './mailbox-connections'
import { PersonalMailError } from './personal-mail-error'
import type { PersonalMailProvider } from './personal-mail-provider'
import { SenderAddressError, SenderAddressNotFoundError } from './sender-address-error'
import { hasListing, isRemoved, senderRowState } from './sender-address-state'
import { listConnection, listConnections, type ConnectionListing } from './sender-listing'
import type { MailSenderRow, MailSenderStore } from './sender-store'

/**
 * The mail provider of `linked`, the accounts linked to a person, of the app's `providers` in their order, with the
 * account that holds its tokens. Linking a mailbox takes the mail scopes off the person's other accounts of that
 * provider (`mailLinkHooks`), so one account holds them; of accounts that still both hold them, as when both were
 * linked before that, the one created last.
 */
export const linkedMailbox = (linked: LinkedAccount[], providers: PersonalMailProvider[]) => {
  for (const provider of providers) {
    const holding = linked.filter((candidate) => candidate.providerId === provider.signInProvider && provider.scopes.every((scope) => candidate.scopes.includes(scope)))
    const account = holding.reduce<LinkedAccount | undefined>((latest, candidate) => (latest && latest.createdAt >= candidate.createdAt ? latest : candidate), undefined)
    if (account) return { provider, account }
  }
  return
}

/** The mail provider `userId` linked, with the account that holds its tokens (see `linkedMailbox`). */
export const linkedProvider = async (accounts: LinkedAccounts, providers: PersonalMailProvider[], userId: string) => linkedMailbox(await accounts.accounts(userId), providers)

/**
 * A message from someone's own mailbox: from the From address record `sender_address_id` names, null for the
 * mailbox's own address; without it, from their default address, else their mailbox's own.
 */
export type PersonalMailMessage = MailMessage & { sender_address_id?: string | null }

/** Mail from someone's own mailbox, and the From addresses they may send it from. */
export type PersonalMail = {
  /**
   * Sends `message` through the mailbox connection of the From address it names, from that address, with its display
   * name: the record decides both, so they cannot disagree. Rejects, sending nothing, with a 404 problem for an id
   * that is not one of the person's, and with a `SenderAddressError` for an address the provider says the mailbox
   * cannot send as (`failed`), one still `pending`, or one on no connection they can send through (`detached`). An
   * address no listing read yet is listed first, when its provider can. Resolves to the `Message-ID` the recipient
   * sees when the mail provider can tell it (see `SentMail`).
   */
  send: (message: PersonalMailMessage) => Promise<SentMail>
  /** The sender a From address stands for, with its record's id and own signature, or refuses as `chooseSender` does. */
  sender: (address?: string) => Promise<MailSender>
  /** Every sender the person may choose, as a send dialog lists them, each with its state. */
  senders: () => Promise<MailSender[]>
  /** Lists the send-as addresses of each of the person's connections whose provider can, each on its own (`listConnections`). */
  refresh: () => Promise<ConnectionListing[]>
}

// The From header comes from the record alone: a message that names its own From or Sender is a mistake of the caller's.
const refuseOwnFrom = (message: MailMessage) => {
  const named = [...Object.keys(message), ...Object.keys(message.headers ?? {})].find((name) => ['from', 'sender'].includes(name.toLowerCase()))
  if (named) throw new Error(`personalMail.send takes the From address as sender_address_id, never as "${named}"`)
}

/**
 * Mail from `userId`'s own mailbox: each message goes out through one of the connections they linked, with an access
 * token refreshed when it expired, from a From address record of theirs. Rejects with a `PersonalMailError` and sends
 * nothing when the mailbox it goes through is not linked (`not_linked`) or the provider no longer honours the link (`link_expired`).
 */
export const personalMailer = (accounts: LinkedAccounts, providers: PersonalMailProvider[], senders: MailSenderStore, userId: string, now = () => new Date()): PersonalMail => {
  const lister = { accounts, senders, userId, now }
  const bookOf = async (): Promise<SenderBook> => {
    const [rows, linked] = await Promise.all([senders.ofUser(userId), accounts.accounts(userId)])
    const ownAddress = linkedMailbox(linked, providers)?.account.address
    return { userId, rows, connections: mailboxConnections(linked, providers), ...(ownAddress && { ownAddress }) }
  }

  const sendThrough = async ({ account, provider }: MailboxConnection, message: MailMessage, row?: MailSenderRow) => {
    const accessToken = await accounts.accessToken(userId, account, provider.id)
    return provider.send(message, accessToken, row && { address: row.address, ...(row.name && { name: row.name }) })
  }

  // The mailbox's own address, with no From header: through the connection mail goes through last (`linkedMailbox`).
  const sendAsMailbox = async (book: SenderBook, message: MailMessage) => {
    const linked = linkedMailbox(book.connections.map(({ account }) => account), providers)
    if (!linked) throw new PersonalMailError('not_linked')
    return sendThrough(linked, message)
  }

  // A row no listing read since it was typed or removed is listed first, so the provider's word decides before it goes out.
  const checked = async (row: MailSenderRow, connection: MailboxConnection) => {
    if (!connection.provider.list_sender_addresses || hasListing(row)) return row
    const listing = await listConnection(lister, connection)
    if (listing.status !== 'listed') return row
    return (await senders.ofUser(userId)).find((candidate) => candidate.id === row.id) ?? row
  }

  return {
    send: async ({ sender_address_id, ...message }) => {
      refuseOwnFrom(message)
      const book = await bookOf()
      if (sender_address_id === null) return sendAsMailbox(book, message)
      const row = sender_address_id === undefined ? book.rows.find((candidate) => candidate.isDefault && !isRemoved(candidate)) : book.rows.find((candidate) => candidate.id === sender_address_id)
      if (!row && sender_address_id === undefined) return sendAsMailbox(book, message)
      if (!row || isRemoved(row)) throw new SenderAddressNotFoundError()
      const connection = book.connections.find(({ account }) => account.id === row.connectionId)
      if (!connection) throw new SenderAddressError('sender_address_detached')
      const state = senderRowState(await checked(row, connection), true)
      if (state === 'failed') throw new SenderAddressError('sender_address_failed')
      if (state === 'pending') throw new SenderAddressError('sender_address_pending')
      return sendThrough(connection, message, row)
    },
    sender: async (address) => chooseSender(await bookOf(), address),
    senders: async () => usableSenders(await bookOf()),
    refresh: async () => listConnections(lister, (await bookOf()).connections),
  }
}
