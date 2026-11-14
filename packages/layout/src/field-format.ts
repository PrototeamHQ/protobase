import type { BooleanFieldProps, DateFieldProps, NumberFieldProps } from './inline-fields'

// How the field components turn a value into text, as react-admin's do (packages/ra-ui-materialui/src/field), shared
// by the web and the text form so both read the same.

/** Whether a field component shows its `emptyText` for `value`: as react-admin tests it, per component. */
export const isEmptyFieldValue = (type: string, value: unknown) => {
  if (type === 'BooleanField') return value !== true && value !== false
  if (type === 'NumberField' || type === 'UrlField') return value === null || value === undefined
  return value === null || value === undefined || value === ''
}

/** A value as `TextField` shows it: text as it is, anything else as its string; an object as JSON. */
export const textFieldText = (value: unknown) => (typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value))

/** A number as `NumberField` shows it, a numeric string read as its number first. */
export const numberFieldText = (value: unknown, { locales, options }: Pick<NumberFieldProps, 'locales' | 'options'>, locale?: string) => {
  const number = typeof value === 'string' && value !== '' && !Number.isNaN(Number(value)) ? Number(value) : value
  return typeof number === 'number' ? number.toLocaleString(locales ?? locale, options) : String(number)
}

export type DateTextInput = {
  /** The reader's locale, used where the component names no `locales`; the runtime's default when omitted. */
  locale?: string
  /** Now, in milliseconds, which `format="relative"` counts from. */
  now: number
  /** How long ago a moment was, in seconds (negative for one to come), as the client words it. */
  relative: (seconds: number) => string
}

/** A date as `DateField` shows it: a date-only value such as `2026-02-15` in UTC, so no time zone moves its day. */
export const dateFieldText = (value: unknown, props: Pick<DateFieldProps, 'showDate' | 'showTime' | 'locales' | 'options' | 'format'>, input: DateTextInput) => {
  const date = value instanceof Date ? value : typeof value === 'string' || typeof value === 'number' ? new Date(value) : undefined
  if (!date) return ''
  if (props.format === 'relative') return input.relative(Math.round((input.now - date.getTime()) / 1000))
  const { showDate = true, showTime = false, options } = props
  const locales = props.locales ?? input.locale
  if (showDate && showTime) return date.toLocaleString(locales, options)
  if (showTime) return date.toLocaleTimeString(locales, options)
  const dateOptions = options ?? (typeof value === 'string' && value.length <= 10 ? { timeZone: 'UTC' } : undefined)
  return date.toLocaleDateString(locales, dateOptions)
}

/** The word for a boolean, as `BooleanField` labels its mark: `valueLabelTrue` or `valueLabelFalse`, else the client's yes or no. */
export const booleanFieldText = (value: boolean, props: Pick<BooleanFieldProps, 'valueLabelTrue' | 'valueLabelFalse'>, words: { yes: string; no: string }) =>
  value ? (props.valueLabelTrue ?? words.yes) : (props.valueLabelFalse ?? words.no)

// The schemes a link may follow; another, such as javascript: or data:, could run code, so its address shows as text.
const safeSchemes = new Set(['http:', 'https:', 'mailto:', 'tel:'])

/**
 * The address `UrlField` links to: one with an `http:`, `https:`, `mailto:` or `tel:` scheme, or a path on the app's
 * own origin; `undefined` for any other, which then shows as text.
 */
export const safeFieldUrl = (value: string): string | undefined => {
  // Browsers drop leading control characters and spaces, and tabs and newlines anywhere, before reading the scheme
  // eslint-disable-next-line no-control-regex
  const read = value.replace(/^[\u0000- ]+/, '').replace(/[\t\n\r]/g, '')
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(read)?.[1]
  if (scheme === undefined) return read.startsWith('/') || !read.includes(':') ? value : undefined
  return safeSchemes.has(`${scheme.toLowerCase()}:`) ? value : undefined
}
