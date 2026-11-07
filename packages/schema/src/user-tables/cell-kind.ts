/**
 * A cell of a file as a table is made from it: text (every CSV cell), a number, a boolean, a date or time a workbook
 * stores as one (`{ date: '2026-03-01' }` or `{ date: '2026-03-01T14:30:00' }`, without a zone), a JSON file's nested
 * object or array (`{ json }`), or `null` for an empty cell.
 */
export type FileCell = string | number | boolean | FileDate | FileJson | null

/** A date or time a workbook stores as one. */
export type FileDate = {
  /** `2026-03-01`, or `2026-03-01T14:30:00` with its time and no zone. */
  date: string
}

/** A JSON file's nested object or array. */
export type FileJson = {
  /** The value as the file states it. */
  json: unknown
}

/** Whether the cell holds nothing: no value, or only spaces. */
export const isEmptyFileCell = (cell: FileCell) => cell === null || (typeof cell === 'string' && cell.trim() === '')

/**
 * What one cell says it is. Only forms that read one way are anything but text: a whole number without leading zeros
 * or a plus sign (so `007` and `+31` stay text), a decimal with a point, true or false, an ISO date, an ISO date and
 * time with its zone (`zoned`) or without (`local`), or a nested JSON value. A comma decimal, a thousands separator or
 * `03/04/2026` could be read two ways, so they are text.
 */
export type CellKind = 'text' | 'whole' | 'decimal' | 'boolean' | 'date' | 'local' | 'zoned' | 'json'

const wholePattern = /^-?(0|[1-9]\d*)$/
const decimalPattern = /^-?(0|[1-9]\d*)\.\d+$/
const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/
const timePattern = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})?$/

const isCalendarDate = (text: string) => {
  const match = datePattern.exec(text)
  if (!match) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const at = new Date(Date.UTC(year, month - 1, day))
  return at.getUTCFullYear() === year && at.getUTCMonth() === month - 1 && at.getUTCDate() === day
}

const textKind = (text: string): CellKind => {
  if (wholePattern.test(text)) return 'whole'
  if (decimalPattern.test(text)) return 'decimal'
  if (/^(true|false)$/i.test(text)) return 'boolean'
  if (isCalendarDate(text)) return 'date'
  const time = timePattern.exec(text)
  if (!time?.[1] || !isCalendarDate(time[1])) return 'text'
  if (Number(time[2]) > 23 || Number(time[3]) > 59 || Number(time[4] ?? 0) > 59) return 'text'
  return time[5] ? 'zoned' : 'local'
}

/** What a cell that is not empty says it is. */
export const cellKind = (cell: Exclude<FileCell, null>): CellKind => {
  if (typeof cell === 'boolean') return 'boolean'
  if (typeof cell === 'number') return Number.isInteger(cell) ? 'whole' : 'decimal'
  if (typeof cell === 'string') return textKind(cell.trim())
  if ('json' in cell) return 'json'
  return cell.date.includes('T') ? 'local' : 'date'
}

/** A number cell, or the text of a whole or decimal one, as plain digits with a point: `1e21` as `1000000000000000000000`. */
export const plainNumber = (cell: string | number) =>
  typeof cell === 'number' ? cell.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 100 }) : cell.trim()
