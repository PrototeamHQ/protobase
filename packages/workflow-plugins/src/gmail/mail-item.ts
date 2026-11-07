import PostalMime, { addressParser, decodeWords, type Address, type PostalMimeError } from 'postal-mime'
import type { MessageRef } from './calls'
import type { MailAddress, MailItem } from './item-bounds'

// The codes postal-mime rejects a mail with that is too deep, too many parts or too large in its headers.
const tooComplex = new Set(['EMAXNESTINGDEPTH', 'EMAXHEADERSIZE', 'EMAXPARTCOUNT', 'EMAXFORWARDEDADDRESSES'])

const stated = (value: string | undefined) => (value === undefined || value === '' ? null : value)

// A group's members are the addresses it holds; its own name addresses no one.
const mailboxes = (list: Address[] | undefined): MailAddress[] =>
  (list ?? []).flatMap((entry) => (entry.group ? entry.group : [entry])).map(({ name, address }) => ({ name: stated(name), address: stated(address) }))

/** A mail's raw source as the run's input, values as the mail states them; `undefined` when it is too complex to parse. */
export const parsedItem = async (ref: MessageRef, raw: Uint8Array): Promise<MailItem | undefined> => {
  const mail = await PostalMime.parse(raw).catch((error: unknown) => {
    if (tooComplex.has((error as Partial<PostalMimeError>)?.code ?? '')) return
    throw error
  })
  if (!mail) return
  return {
    message_id: ref.id,
    thread_id: ref.threadId,
    from: mailboxes(mail.from ? [mail.from] : undefined)[0] ?? null,
    to: mailboxes(mail.to),
    cc: mailboxes(mail.cc),
    subject: stated(mail.subject),
    date: stated(mail.date),
    text: stated(mail.text),
    html: stated(mail.html),
    attachments: mail.attachments.map((attachment) => ({ filename: attachment.filename, content_type: stated(attachment.mimeType), size: attachmentSize(attachment.content) })),
    truncated: false,
  }
}

const attachmentSize = (content: ArrayBuffer | Uint8Array | string) => (typeof content === 'string' ? content.length : content.byteLength)

/**
 * A mail too large or too complex to read whole, from its headers alone: no body and no attachment names, which the
 * headers do not hold, and `truncated` set.
 */
export const headersItem = (ref: MessageRef, headers: { name: string; value: string }[]): MailItem => {
  const header = (name: string) => headers.find((entry) => entry.name.toLowerCase() === name.toLowerCase())?.value
  const addresses = (name: string) => {
    const value = header(name)
    return value === undefined ? [] : mailboxes(addressParser(value)).map(({ name: shown, address }) => ({ name: shown === null ? null : stated(decodeWords(shown)), address }))
  }
  const subject = header('Subject')
  return {
    message_id: ref.id,
    thread_id: ref.threadId,
    from: addresses('From')[0] ?? null,
    to: addresses('To'),
    cc: addresses('Cc'),
    subject: subject === undefined ? null : stated(decodeWords(subject)),
    date: stated(header('Date')),
    text: null,
    html: null,
    attachments: null,
    truncated: true,
  }
}
