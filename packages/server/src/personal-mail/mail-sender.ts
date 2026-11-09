import { MailSenderRefusedError } from './mail-sender-refused'
import type { MailSenderRow, MailSenderStore } from './sender-store'

/**
 * A From address someone may send mail from: `address`, unknown when it is the mailbox's own and the link does not name
 * it; `ownerId`, whose mailbox it goes out through; its own `signature`, if it has one; and whether it is `shared`.
 */
export type MailSender = { address?: string; ownerId: string; signature?: string; shared: boolean }

// Whether `userId` may send from the shared row, as `sharersFor` answered for them.
const reaches = (sharers: 'everyone' | Set<string>) => (row: MailSenderRow) => sharers === 'everyone' || sharers.has(row.userId)

const senderOf = (row: MailSenderRow): MailSender => ({ address: row.address, ownerId: row.userId, ...(row.signature && { signature: row.signature }), shared: row.shared })

/**
 * The sender `userId` sends as with `from`, matched without regard to case: an address they entered; else their
 * mailbox's own address (`ownAddress`); else one another person shared with them (`sharersFor`), through the first to
 * share it. Without `from`,
 * their default address, else their mailbox's own. Refuses with `MailSenderRefusedError` any other address, a private
 * one of someone else's included.
 */
export const chooseSender = async (senders: MailSenderStore, userId: string, ownAddress: () => Promise<string | undefined>, from?: string): Promise<MailSender> => {
  const own = await senders.ofUser(userId)
  if (from === undefined) {
    const chosen = own.find((row) => row.isDefault)
    if (chosen) return senderOf(chosen)
    const address = await ownAddress()
    return { ...(address && { address }), ownerId: userId, shared: false }
  }
  const address = from.trim().toLowerCase()
  const entered = own.find((row) => row.address === address)
  if (entered) return senderOf(entered)
  const mailbox = await ownAddress()
  if (mailbox && mailbox.toLowerCase() === address) return { address: mailbox, ownerId: userId, shared: false }
  const [shared, sharers] = await Promise.all([senders.sharedAs(address), senders.sharersFor(userId)])
  const reached = shared.find(reaches(sharers))
  if (reached) return senderOf(reached)
  throw new MailSenderRefusedError(from)
}

/**
 * Every sender `userId` may choose: their mailbox's own address, when the link names it, and those they entered, then
 * the addresses others shared with them that they did not enter themselves, each once.
 */
export const usableSenders = async (senders: MailSenderStore, userId: string, ownAddress: () => Promise<string | undefined>): Promise<MailSender[]> => {
  const [own, everyShared, sharers, mailbox] = await Promise.all([senders.ofUser(userId), senders.shared(), senders.sharersFor(userId), ownAddress()])
  const shared = everyShared.filter(reaches(sharers))
  const mailboxSender = mailbox && !own.some((row) => row.address === mailbox.toLowerCase()) ? [{ address: mailbox, ownerId: userId, shared: false }] : []
  const taken = new Set([...own.map((row) => row.address), ...(mailbox ? [mailbox.toLowerCase()] : [])])
  const others = shared.filter((row) => {
    if (taken.has(row.address)) return false
    taken.add(row.address)
    return true
  })
  return [...mailboxSender, ...own.map(senderOf), ...others.map(senderOf)]
}
