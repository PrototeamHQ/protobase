import type { ConvertOptions } from './convert'

/**
 * How the browser's locale writes numbers and dates, as the import's starting choice: its decimal separator, and whether
 * its dates put the day or the month first. The user sees both and can change them.
 */
export const localeFormats = (locale?: string): ConvertOptions => {
  const decimal = new Intl.NumberFormat(locale).formatToParts(1.5).find((part) => part.type === 'decimal')?.value === ',' ? ',' : '.'
  const parts = new Intl.DateTimeFormat(locale).formatToParts(new Date(2026, 3, 3)).map((part) => part.type)
  return { decimal, dateOrder: parts.indexOf('month') < parts.indexOf('day') ? 'mdy' : 'dmy' }
}
