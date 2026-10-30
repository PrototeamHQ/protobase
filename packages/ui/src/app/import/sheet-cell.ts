import { text } from './messages'
/**
 * A cell as a file holds it: text (every CSV cell), a number, a boolean, a date or time a workbook stores as one, or
 * `null` for an empty cell. A date is its wall-clock time without a zone: `2026-03-01` or `2026-03-01T14:30:00`.
 */
export type SheetCell = string | number | boolean | SheetDate | null

export type SheetDate = { date: string }

/** A row of cells, with its line in the file as the spreadsheet numbers it: the header is line 1. */
export type SheetRow = { line: number; cells: SheetCell[] }

export const isSheetDate = (cell: SheetCell): cell is SheetDate => typeof cell === 'object' && cell !== null

/** Whether the cell holds nothing: no value, or only spaces. */
export const isEmptyCell = (cell: SheetCell) => cell === null || (typeof cell === 'string' && cell.trim() === '')

/** The cell as the file shows it, for a header, a preview or the file of failed rows. */
export const cellText = (cell: SheetCell) => {
  if (cell === null) return ''
  if (isSheetDate(cell)) return cell.date.replace('T', ' ')
  if (typeof cell === 'boolean') return cell ? 'TRUE' : 'FALSE'
  return String(cell)
}

/** A column's letters as a spreadsheet names it: 0 is A, 27 is AB. */
export const columnLetters = (index: number): string => (index < 26 ? String.fromCharCode(65 + index) : columnLetters(Math.floor(index / 26) - 1) + columnLetters(index % 26))

/** How the import names a column: its header, or "Column C" when the header cell is empty. */
export const columnName = (headers: string[], index: number) => (headers[index]?.trim() ? headers[index]! : text('column', { letters: columnLetters(index) }))
