import type { MailSenders, MailSenderState } from '@protobase/client'

/**
 * An address the person may send from, as a mail sender field offers it, with the display name they gave it and its
 * state; their mailbox's own address has none, as its provider sends as it. One someone else shared with them is
 * `shared`, and verified, or it would not be offered.
 */
export type SenderOption = { address: string; name?: string; state?: MailSenderState; shared?: true }

/** Whether two addresses are the same, as sending matches them: without regard to case. */
export const sameAddress = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * The addresses the person may send from, in the order sending lists them: their mailbox's own, when its link names it
 * and no address of theirs holds it too, then theirs, oldest first, then those others shared with them, each address
 * once; one on no mailbox they connected is left out, as nothing can go out from it.
 */
export const senderOptions = ({ address, senders, shared = [] }: MailSenders): SenderOption[] => {
  const usable = senders.filter((sender) => sender.state !== 'detached')
  const mailbox = address && !usable.some((sender) => sameAddress(sender.address, address)) ? [{ address }] : []
  const own = usable.map((sender): SenderOption => ({ address: sender.address, ...(sender.name && { name: sender.name }), state: sender.state }))
  const theirs = shared.map((sender): SenderOption => ({ address: sender.address, ...(sender.name && { name: sender.name }), shared: true }))
  const options = [...mailbox, ...own, ...theirs]
  return options.filter((option, i) => options.findIndex((other) => sameAddress(other.address, option.address)) === i)
}

/** An address as a From header shows it: `Name <address>` with a display name, else the bare address. */
export const senderLabel = ({ address, name }: SenderOption) => (name ? `${name} <${address}>` : address)
