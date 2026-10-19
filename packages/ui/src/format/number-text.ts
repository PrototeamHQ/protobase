import { formatTag } from '../locale/active-locale'

/** The mark between a number's whole part and its fraction. */
export type DecimalSeparator = '.' | ','

/** The decimal separator `locale` writes, the screens' unless given: `,` for nl-NL and de-DE, `.` for en-GB. */
export const localeDecimal = (locale = formatTag()): DecimalSeparator =>
  new Intl.NumberFormat(locale).formatToParts(1.5).find((part) => part.type === 'decimal')?.value === ',' ? ',' : '.'

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * A number written as text, as a plain decimal (`-1234.5`): digits grouped by thousands with the other separator or
 * spaces, and the `decimal` separator before the fraction. Undefined when the text is no such number.
 */
export const parseNumberText = (text: string, decimal: DecimalSeparator) => {
  const group = `[${escapeRegExp(decimal === '.' ? ',' : '.')}\\s\\u00a0\\u202f']`
  const pattern = new RegExp(`^([-+]?)(\\d{1,3}(?:${group}\\d{3})+|\\d+)(?:${escapeRegExp(decimal)}(\\d+))?$`)
  const match = pattern.exec(text.trim())
  if (match) return `${match[1] === '-' ? '-' : ''}${match[2]!.replace(/\D/g, '')}${match[3] ? `.${match[3]}` : ''}`
  // Scientific notation, as programs write very large or small numbers
  if (decimal === '.' && /^[-+]?\d+(\.\d+)?e[-+]?\d+$/i.test(text.trim())) return String(Number(text.trim()))
  return undefined
}
