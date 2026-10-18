import { enumLabel, type FieldModel, type FieldViewModel } from '@protobase/schema'
import { parseNumberText, type DecimalSeparator } from '../../format/number-text'
import { cellText, isEmptyCell, isSheetDate, type SheetCell } from './sheet-cell'

/**
 * How the file writes what is ambiguous in text: the decimal separator of numbers (`1,234.5` or `1.234,5`), and whether
 * a date such as 03/04/2026 starts with the day or the month. ISO dates (2026-04-03) read the same either way.
 */
export type ConvertOptions = { decimal: DecimalSeparator; dateOrder: 'dmy' | 'mdy' }

export type Converted = { ok: true; value: unknown } | { ok: false; problem: string }

const ok = (value: unknown): Converted => ({ ok: true, value })
const problem = (text: string): Converted => ({ ok: false, problem: text })
const quoted = (cell: SheetCell) => `“${cellText(cell)}”`

const toNumberText = (cell: SheetCell, options: ConvertOptions) => {
  if (typeof cell === 'number') return String(cell)
  if (typeof cell === 'string') return parseNumberText(cell, options.decimal)
  return undefined
}

const integerValue = (field: FieldModel, cell: SheetCell, options: ConvertOptions): Converted => {
  const text = toNumberText(cell, options)
  if (text === undefined) return problem(`${quoted(cell)} is not a number`)
  const [whole, fraction = ''] = text.split('.')
  if (/[1-9]/.test(fraction) || /e/i.test(text)) return problem(`${quoted(cell)} is not a whole number`)
  if (field.type === 'bigint') return ok(String(BigInt(whole!)))
  const value = Number(whole)
  return Number.isSafeInteger(value) ? ok(value) : problem(`${quoted(cell)} is too large`)
}

const decimalValue = (cell: SheetCell, options: ConvertOptions): Converted => {
  const text = toNumberText(cell, options)
  return text === undefined ? problem(`${quoted(cell)} is not a number`) : ok(text)
}

const trueWords = new Set(['true', 'yes', '1'])
const falseWords = new Set(['false', 'no', '0'])

const booleanValue = (cell: SheetCell): Converted => {
  if (typeof cell === 'boolean') return ok(cell)
  const text = typeof cell === 'string' || typeof cell === 'number' ? String(cell).trim().toLowerCase() : ''
  if (trueWords.has(text)) return ok(true)
  if (falseWords.has(text)) return ok(false)
  return problem(`${quoted(cell)} is not true or false (true, false, yes, no, 1 or 0)`)
}

const pad = (value: number) => String(value).padStart(2, '0')

// A calendar date that exists, as YYYY-MM-DD
const calendarDate = (year: number, month: number, day: number) => {
  const at = new Date(Date.UTC(year, month - 1, day))
  if (at.getUTCFullYear() !== year || at.getUTCMonth() !== month - 1 || at.getUTCDate() !== day) return undefined
  return `${year}-${pad(month)}-${pad(day)}`
}

type WallTime = { date: string; time?: string; zone?: string }

const timePattern = '(\\d{1,2}):(\\d{2})(?::(\\d{2})(?:\\.\\d+)?)?'

// A date and time written as text: ISO (2026-04-03, 2026-04-03T14:30:00+02:00) or day and month in the file's order
// (03/04/2026 14:30), with a four-digit year
const readWallTime = (text: string, order: ConvertOptions['dateOrder']): WallTime | undefined => {
  const iso = new RegExp(`^(\\d{4})[-/](\\d{1,2})[-/](\\d{1,2})(?:[T ]${timePattern}(Z|[+-]\\d{2}:?\\d{2})?)?$`).exec(text.trim())
  const local = new RegExp(`^(\\d{1,2})[./-](\\d{1,2})[./-](\\d{4})(?: ${timePattern})?$`).exec(text.trim())
  if (!iso && !local) return undefined
  const [year, month, day] = iso ? [iso[1], iso[2], iso[3]].map(Number) : order === 'dmy' ? [local![3], local![2], local![1]].map(Number) : [local![3], local![1], local![2]].map(Number)
  const date = calendarDate(year!, month!, day!)
  if (!date) return undefined
  const [hours, minutes, seconds = '0'] = (iso ? iso.slice(4, 7) : local!.slice(4, 7)) as [string | undefined, string | undefined, string | undefined]
  if (hours === undefined) return { date }
  if (Number(hours) > 23 || Number(minutes) > 59 || Number(seconds) > 59) return undefined
  return { date, time: `${pad(Number(hours))}:${minutes}:${pad(Number(seconds))}`, zone: iso?.[7] }
}

const wallTimeOf = (cell: SheetCell, options: ConvertOptions): WallTime | undefined => {
  if (isSheetDate(cell)) {
    const [date, time] = cell.date.split('T')
    return { date: date!, time }
  }
  return typeof cell === 'string' ? readWallTime(cell, options.dateOrder) : undefined
}

const notDate = (cell: SheetCell, options: ConvertOptions) =>
  problem(`${quoted(cell)} is not a date (2026-04-03 or ${options.dateOrder === 'dmy' ? 'day/month/year' : 'month/day/year'})`)

const dateValue = (cell: SheetCell, options: ConvertOptions): Converted => {
  const at = wallTimeOf(cell, options)
  if (!at) return notDate(cell, options)
  if (at.time && at.time !== '00:00:00') return problem(`${quoted(cell)} has a time of day; the field holds a date`)
  return ok(at.date)
}

// A time without a zone is the browser's local time, as the person reading the sheet sees it
const timestampValue = (cell: SheetCell, options: ConvertOptions): Converted => {
  const at = wallTimeOf(cell, options)
  if (!at) return notDate(cell, options)
  if (at.zone) return ok(new Date(`${at.date}T${at.time}${at.zone === 'Z' ? 'Z' : at.zone.replace(/^([+-]\d{2})(\d{2})$/, '$1:$2')}`).toISOString())
  const [year, month, day] = at.date.split('-').map(Number)
  const [hours, minutes, seconds] = (at.time ?? '00:00:00').split(':').map(Number)
  return ok(new Date(year!, month! - 1, day!, hours, minutes, seconds).toISOString())
}

const normalized = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ')

const enumValue = (field: FieldModel, hints: FieldViewModel | undefined, cell: SheetCell): Converted => {
  const values = field.enumValues ?? []
  const text = normalized(cellText(cell))
  const matches = values.filter((value) => normalized(value) === text || normalized(enumLabel(value, hints?.valueLabels)) === text)
  if (matches.length === 1) return ok(matches[0])
  if (matches.length > 1) return problem(`${quoted(cell)} matches more than one value: ${matches.map((value) => enumLabel(value, hints?.valueLabels)).join(', ')}`)
  return problem(`${quoted(cell)} is not one of ${values.map((value) => enumLabel(value, hints?.valueLabels)).join(', ')}`)
}

const textValue = (cell: SheetCell): Converted => (typeof cell === 'boolean' ? problem(`${quoted(cell)} is true or false, not text`) : ok(cellText(cell)))

/**
 * The value a cell gives a field, as the API takes it, or the problem that keeps it from being one: never a guess, and an
 * empty cell is null, never a default. A relation's cell is the value of the field its records are found by, so it
 * converts as that field (`convertCell(targetField, ...)`).
 */
export const convertCell = (field: FieldModel, hints: FieldViewModel | undefined, cell: SheetCell, options: ConvertOptions): Converted => {
  if (isEmptyCell(cell)) return field.nullable ? ok(null) : problem('is empty, and it is required')
  switch (field.type) {
    case 'integer':
    case 'bigint':
      return integerValue(field, cell, options)
    case 'decimal':
      return decimalValue(cell, options)
    case 'boolean':
      return booleanValue(cell)
    case 'date':
      return dateValue(cell, options)
    case 'timestamp':
      return timestampValue(cell, options)
    case 'enum':
      return enumValue(field, hints, cell)
    case 'text':
    case 'uuid':
    case 'currency':
    case 'country':
      return textValue(cell)
    default:
      throw new Error(`Not implemented: importing ${field.type} fields, which importableFields leaves out`)
  }
}
