import type { FieldModel, FieldViewModel } from '@protobase/schema'
import type { RelatedLabels } from '@protobase/client'
import { displayValue } from '../../live/display-value'
import { fileShown, isStoredFile } from '../../live/file-values'
import { viewerZone, zoneOffset } from '../../format/zone'

/** `shown` exports values as the list shows them (labels, formatted dates and numbers), `raw` as the API stores them. */
export type ExportMode = 'shown' | 'raw'

/** One column of an export: the field it reads, its header (the field's label) and the view's hints for it. */
export type ExportColumn = { name: string; header: string; field: FieldModel; hints: FieldViewModel }

/** A typed spreadsheet cell; a date is a number of days since 1900 with a date format, as Excel stores it. */
export type Cell = { kind: 'empty' } | { kind: 'text'; value: string } | { kind: 'number'; value: number; format?: string } | { kind: 'boolean'; value: boolean }

const empty: Cell = { kind: 'empty' }
const text = (value: string): Cell => ({ kind: 'text', value })

const isEmpty = (value: unknown) => value === null || value === undefined || value === ''

const relationLabel = (column: ExportColumn, value: unknown, labels: RelatedLabels) => labels[column.name]?.[String(value)] ?? String(value)

// A file's name as the list shows it; raw, its stored `uri`, since a private file's URL is signed for an hour or two.
const fileText = (value: unknown, mode: ExportMode) => {
  if (!isStoredFile(value)) return String(value)
  return mode === 'raw' ? value.uri : (fileShown(value)?.name ?? value.uri)
}

/** A value as one CSV field: as the list shows it, or as the API sends it, empty for no value. */
export const csvText = (column: ExportColumn, value: unknown, labels: RelatedLabels, mode: ExportMode) => {
  if (isEmpty(value)) return ''
  const { field, hints } = column
  if (field.type === 'file') return fileText(value, mode)
  if (field.type === 'relation') return mode === 'shown' ? relationLabel(column, value, labels) : String(value)
  if (mode === 'shown') return displayValue(field, value, { ...hints, format: undefined })
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

// Excel counts days from 30 December 1899 and has no time zones: a shown time is on the viewer's clock, as the list shows
// it, and a raw one in UTC, as the API sends it.
const excelEpochDays = 25_569
const msPerDay = 86_400_000
const excelSerial = (ms: number) => ms / msPerDay + excelEpochDays

const dateFormats = { shown: { date: 'd mmm yyyy', timestamp: 'd mmm yyyy, hh:mm' }, raw: { date: 'yyyy-mm-dd', timestamp: 'yyyy-mm-dd hh:mm:ss' } }

// Every character of a prefix or suffix escaped, so Excel shows it as it is around the number.
const literal = (affix: string | undefined) => [...(affix ?? '')].map((char) => `\\${char}`).join('')

/** The Excel number format that shows a number as the list does: its decimals, prefix and suffix, or a percent sign. */
export const numberFormat = (hints: FieldViewModel) => {
  if (hints.format === 'percent') return 'General\\%'
  const digits = hints.decimals === undefined ? 'General' : hints.decimals > 0 ? `#,##0.${'0'.repeat(hints.decimals)}` : '#,##0'
  const code = `${literal(hints.prefix)}${digits}${literal(hints.suffix)}`
  return code === 'General' ? undefined : code
}

// A number when the text holds one exactly enough to calculate with; a bigint past 2^53 stays text, so no digit is lost.
const numberCell = (column: ExportColumn, value: unknown, mode: ExportMode): Cell => {
  const number = Number(value)
  if (!Number.isFinite(number)) return text(String(value))
  if (column.field.type === 'bigint' && !Number.isSafeInteger(number)) return text(String(value))
  const format = mode === 'shown' ? numberFormat(column.hints) : undefined
  return format ? { kind: 'number', value: number, format } : { kind: 'number', value: number }
}

const dateCell = (type: 'date' | 'timestamp', value: unknown, mode: ExportMode, zone: string): Cell => {
  const ms = Date.parse(String(value))
  if (Number.isNaN(ms)) return text(String(value))
  const clock = type === 'timestamp' && mode === 'shown' ? ms + zoneOffset(ms, zone) : ms
  return { kind: 'number', value: excelSerial(clock), format: dateFormats[mode][type] }
}

/** A value as one typed Excel cell: numbers, dates and booleans as such, labels or stored values as text. */
export const xlsxCell = (column: ExportColumn, value: unknown, labels: RelatedLabels, mode: ExportMode, zone = viewerZone()): Cell => {
  if (isEmpty(value)) return empty
  const { field } = column
  switch (field.type) {
    case 'boolean':
      return { kind: 'boolean', value: Boolean(value) }
    case 'integer':
    case 'bigint':
    case 'decimal':
      return numberCell(column, value, mode)
    case 'date':
    case 'timestamp':
      return dateCell(field.type, value, mode, zone)
    case 'relation':
      if (mode === 'shown') return text(relationLabel(column, value, labels))
      return typeof value === 'number' ? { kind: 'number', value } : text(String(value))
    default:
      return text(csvText(column, value, labels, mode))
  }
}
