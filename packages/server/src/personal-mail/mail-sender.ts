import { MailSenderRefusedError } from './mail-sender-refused'
import type { MailSenderRow, MailSenderStore } from './sender-store'

/**
 * A From address someone may send mail from: `address`, unknown when it is the mailbox's own and the link does not name
 * it; the display `name` its owner entered, if any; `ownerId`, whose mailbox it goes out through; and its own
 * `signature`, if it has one.
 */
export type MailSender = { address?: string; name?: string; ownerId: string; signature?: string }

const senderOf = (row: MailSenderRow): MailSender => ({
  address: row.address,
  ...(row.name && { name: row.name }),
  ownerId: row.userId,
  ...(row.signature && { signature: row.signature }),
})

/**
 * The sender `userId` sends as with `from`, matched without regard to case: an address they entered; else their
 * mailbox's own address (`ownAddress`). Without `from`, their default address, else their mailbox's own. Refuses with
 * `MailSenderRefusedError` any other address, one someone else entered included.
 */
export const chooseSender = async (senders: MailSenderStore, userId: string, ownAddress: () => Promise<string | undefined>, from?: string): Promise<MailSender> => {
  const own = await senders.ofUser(userId)
  if (from === undefined) {
    const chosen = own.find((row) => row.isDefault)
    if (chosen) return senderOf(chosen)
    const address = await ownAddress()
    return { ...(address && { address }), ownerId: userId }
  }
  const address = from.trim().toLowerCase()
  const entered = own.find((row) => row.address === address)
  if (entered) return senderOf(entered)
  const mailbox = await ownAddress()
  if (mailbox && mailbox.toLowerCase() === address) return { address: mailbox, ownerId: userId }
  throw new MailSenderRefusedError(from)
}

/** Every sender `userId` may choose: their mailbox's own address, when the link names it, then those they entered. */
export const usableSenders = async (senders: MailSenderStore, userId: string, ownAddress: () => Promise<string | undefined>): Promise<MailSender[]> => {
  const [own, mailbox] = await Promise.all([senders.ofUser(userId), ownAddress()])
  const mailboxSender = mailbox && !own.some((row) => row.address === mailbox.toLowerCase()) ? [{ address: mailbox, ownerId: userId }] : []
  return [...mailboxSender, ...own.map(senderOf)]
}
