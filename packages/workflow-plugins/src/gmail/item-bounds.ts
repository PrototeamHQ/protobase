/** An address of a mail as a run gets it: the display name and address as the mail states them, `null` when it states none. */
export type MailAddress = { name: string | null; address: string | null }

export type MailAttachment = { filename: string | null; content_type: string | null; size: number }

/** One new mail as a run's input. `truncated` is set when a value was cut short or left out to fit the bounds below. */
export type MailItem = {
  message_id: string
  thread_id: string
  from: MailAddress | null
  to: MailAddress[]
  cc: MailAddress[]
  subject: string | null
  date: string | null
  text: string | null
  html: string | null
  attachments: MailAttachment[] | null
  truncated: boolean
}

/** The most of each value a run gets of one mail, so a mail cannot make a poll's item too large to start a run. */
export const bounds = {
  addressLength: 320,
  nameLength: 320,
  addresses: 50,
  subjectLength: 1000,
  dateLength: 100,
  /** Characters of `text` and of `html` each; as JSON, at most six bytes a character. */
  bodyLength: 128 * 1024,
  attachments: 50,
  filenameLength: 255,
  contentTypeLength: 255,
  /** The most one item is as JSON, below a run's input limit of 1 MiB: past it, `html` is left out, then `text`. */
  itemBytes: 768 * 1024,
} as const

const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length

// NUL and a lone surrogate, which JSON escapes but the database's JSON refuses, so a run could not keep its input.
const unstorable = /\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

/**
 * Leaves out of each value what the database cannot store and cuts it to its bound, never between the halves of a
 * surrogate pair, then leaves out `html` and then `text` while the item is over `itemBytes` as JSON. Every other value
 * together stays under it even when each character is escaped, so the result always fits.
 */
export const boundItem = (item: MailItem): MailItem => {
  let truncated = item.truncated
  const cut = (value: string | null, most: number) => {
    if (value === null) return value
    const storable = value.replace(unstorable, '')
    if (storable.length !== value.length) truncated = true
    if (storable.length <= most) return storable
    truncated = true
    const splitsPair = /[\uD800-\uDBFF]/.test(storable.charAt(most - 1))
    return storable.slice(0, splitsPair ? most - 1 : most)
  }
  const few = <T>(list: T[], most: number) => {
    if (list.length <= most) return list
    truncated = true
    return list.slice(0, most)
  }
  const address = ({ name, address }: MailAddress): MailAddress => ({ name: cut(name, bounds.nameLength), address: cut(address, bounds.addressLength) })
  const bounded: MailItem = {
    message_id: item.message_id,
    thread_id: item.thread_id,
    from: item.from && address(item.from),
    to: few(item.to, bounds.addresses).map(address),
    cc: few(item.cc, bounds.addresses).map(address),
    subject: cut(item.subject, bounds.subjectLength),
    date: cut(item.date, bounds.dateLength),
    text: cut(item.text, bounds.bodyLength),
    html: cut(item.html, bounds.bodyLength),
    attachments: item.attachments && few(item.attachments, bounds.attachments).map(({ filename, content_type, size }) => ({ filename: cut(filename, bounds.filenameLength), content_type: cut(content_type, bounds.contentTypeLength), size })),
    truncated: false,
  }
  for (const field of ['html', 'text'] as const) {
    if (jsonBytes({ ...bounded, truncated }) <= bounds.itemBytes) break
    if (bounded[field] === null) continue
    bounded[field] = null
    truncated = true
  }
  return { ...bounded, truncated }
}
