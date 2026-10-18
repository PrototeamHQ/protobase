import type { FieldFormat, FieldViewModel } from '@protobase/schema'

/** The formats of a text that is an address: an email to write to, a phone number to call, a web page to open. */
export type ContactFormat = Extract<FieldFormat, 'email' | 'phone' | 'url'>

const contactFormats = new Set<FieldFormat>(['email', 'phone', 'url'])

/** The view's contact format for a field, if it has one. */
export const contactFormat = (hints: FieldViewModel | undefined): ContactFormat | undefined =>
  hints?.format !== undefined && contactFormats.has(hints.format) ? (hints.format as ContactFormat) : undefined

/**
 * Where a value links: `mailto:` an email address, `tel:` a phone number with only its digits and a leading +, and a
 * web address as it is when it is http or https. Nothing for a value that is no such address, which shows as text.
 */
export const contactHref = (format: ContactFormat, value: string) => {
  const text = value.trim()
  if (format === 'email') return /^[^\s@]+@[^\s@]+$/.test(text) ? `mailto:${text}` : undefined
  if (format === 'phone') {
    const digits = text.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '')
    return /\d/.test(digits) ? `tel:${digits}` : undefined
  }
  return /^https?:\/\/\S+$/i.test(text) ? text : undefined
}

/** The input a contact field is edited in: its type, so a mobile screen shows the keyboard for it, and its autofill. */
export const contactInputProps = (format: ContactFormat | undefined) => {
  if (format === 'email') return { type: 'email', inputMode: 'email', autoComplete: 'email' } as const
  if (format === 'phone') return { type: 'tel', inputMode: 'tel', autoComplete: 'tel' } as const
  if (format === 'url') return { type: 'url', inputMode: 'url', autoComplete: 'url' } as const
  return {}
}
