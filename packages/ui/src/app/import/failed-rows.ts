import type { FailedRow } from './run-import'
import { cellText } from './sheet-cell'
import { text as message } from './messages'

// A CSV field, quoted when it holds a delimiter, a quote or a line break
const csvField = (text: string) => (/[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text)

/**
 * The rows an import did not write as a CSV file to fix and import again: the file's own columns, then the row's line in
 * the file and why it was not written. Sorted by line, with a byte order mark so spreadsheet programs read it as UTF-8.
 */
export const failedRowsCsv = (headers: string[], rows: FailedRow[]) => {
  const lines = [...rows]
    .sort((a, b) => a.line - b.line)
    .map((row) => [...headers.map((_, column) => cellText(row.cells[column] ?? null)), String(row.line), row.problems.join('; ')])
  return `﻿${[[...headers, message('line'), message('problems')], ...lines].map((fields) => fields.map(csvField).join(',')).join('\r\n')}\r\n`
}
