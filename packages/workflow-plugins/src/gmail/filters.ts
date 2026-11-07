import type { MailAddress, MailItem } from './item-bounds'

/** The filters a trigger may set, each a case-insensitive "contains". */
export type MailFilters = { from?: string; to?: string; subject?: string }

const contains = (value: string | null, part: string) => value !== null && value.toLowerCase().includes(part.toLowerCase())
const anyAddress = (list: MailAddress[], part: string) => list.some(({ name, address }) => contains(name, part) || contains(address, part))

/**
 * Whether a mail passes every filter that is set: `from` on the sender's name or address, `to` on any To or Cc
 * recipient, `subject` on the subject. A mail without the value a set filter reads does not pass.
 */
export const passes = (item: MailItem, { from, to, subject }: MailFilters) =>
  (from === undefined || anyAddress(item.from ? [item.from] : [], from)) && (to === undefined || anyAddress([...item.to, ...item.cc], to)) && (subject === undefined || contains(item.subject, subject))
