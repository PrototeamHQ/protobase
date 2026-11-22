import type { MailMessage, SentMail } from '../mail/smtp-mailer'
import type { LinkedAccount, LinkedAccounts } from './linked-accounts'
import { chooseSender, usableSenders, type ChosenSender, type MailSender } from './mail-sender'
import { MailSenderRefusedError } from './mail-sender-refused'
import { PersonalMailError } from './personal-mail-error'
import type { PersonalMailProvider } from './personal-mail-provider'
import type { MailSenderStore } from './sender-store'

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

/** A message from someone's own mailbox, from `from` when given: one of the addresses they may send from. */
export type PersonalMailMessage = MailMessage & { from?: string }

/** Mail from someone's own mailbox, and the From addresses they may send it from. */
export type PersonalMail = {
  /**
   * Sends `message` from `from`, else from the person's default address, else from their mailbox's own address. Rejects
   * with a `MailSenderRefusedError`, sending nothing, for an address they may not use. Resolves to the `Message-ID` the
   * recipient sees when the mail provider can tell it (see `SentMail`).
   */
  send: (message: PersonalMailMessage) => Promise<SentMail>
  /** The sender a send with `from` goes out as, with its own signature, or refuses as `send` would. */
  sender: (from?: string) => Promise<MailSender>
  /** Every sender the person may choose, as a send dialog lists them. */
  senders: () => Promise<MailSender[]>
}

const publicSender = ({ through: _through, ...sender }: ChosenSender): MailSender => sender

// A failure of another person's mailbox, told as theirs and naming only the address they shared.
const asOthers = (chosen: ChosenSender) => (error: unknown) => {
  if (error instanceof PersonalMailError) throw new PersonalMailError(error.code, undefined, { owner: 'other', address: chosen.address! })
  throw error
}

/**
 * Mail from `userId`'s own mailbox: each message goes out through the mail provider they linked, with an access token
 * refreshed when it expired, from a From address they may use (`chooseSender`). An address another person shared goes
 * out through that person's mailbox, only while it is still the account a check proved it through; else it is refused
 * as any address they may not use. Rejects with a `PersonalMailError` and sends nothing when the mailbox it goes through
 * is not linked (`not_linked`) or the provider no longer honours the link (`link_expired`), told as another's for a
 * shared address.
 */
export const personalMailer = (accounts: LinkedAccounts, providers: PersonalMailProvider[], senders: MailSenderStore, userId: string): PersonalMail => {
  const ownAddress = async () => (await linkedProvider(accounts, providers, userId))?.account.address
  const choose = (from?: string) => chooseSender(senders, userId, ownAddress, from)
  const sendAs = async (chosen: ChosenSender, message: MailMessage) => {
    const linked = await linkedProvider(accounts, providers, chosen.ownerId)
    if (!linked) throw new PersonalMailError('not_linked')
    if (chosen.through !== undefined && chosen.through !== linked.account.id) throw new MailSenderRefusedError(chosen.address!)
    const accessToken = await accounts.accessToken(chosen.ownerId, linked.account, linked.provider.id)
    return linked.provider.send(message, accessToken, chosen.address ? { address: chosen.address, ...(chosen.name && { name: chosen.name }) } : undefined)
  }
  return {
    send: async ({ from, ...message }) => {
      const chosen = await choose(from)
      if (chosen.ownerId === userId) return sendAs(chosen, message)
      return sendAs(chosen, message).catch(asOthers(chosen))
    },
    sender: async (from) => publicSender(await choose(from)),
    senders: () => usableSenders(senders, userId, ownAddress),
  }
}
