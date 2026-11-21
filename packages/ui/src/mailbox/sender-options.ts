import type { MailSenders } from '@protobase/client'

/** An address the person may send from, as a mail sender field offers it, with the display name they gave it. */
export type SenderOption = { address: string; name?: string }

/** Whether two addresses are the same, as sending matches them: without regard to case. */
export const sameAddress = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * The addresses the person may send from, in the order sending lists them: their mailbox's own, when its link names it
 * and they did not enter it too, then those they entered, oldest first.
 */
export const senderOptions = ({ address, senders }: MailSenders): SenderOption[] => {
  const mailbox = address && !senders.some((sender) => sameAddress(sender.address, address)) ? [{ address }] : []
  return [...mailbox, ...senders.map((sender) => ({ address: sender.address, ...(sender.name && { name: sender.name }) }))]
}

/** An address as a From header shows it: `Name <address>` with a display name, else the bare address. */
export const senderLabel = ({ address, name }: SenderOption) => (name ? `${name} <${address}>` : address)
