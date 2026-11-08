import { columnTypeReader, type ColumnType, type DecimalType } from '@protobase/schema'
import { cellText, isEmptyCell, type SheetRow } from '../sheet-cell'
import type { SheetSource } from '../sheet-source'

/** How many data rows the fields step shows under each column. */
const sampleRows = 5

/** What reading a whole sheet found: its headers, each column's type and the decimal it would be, its first rows and how many rows it has. */
export type ReadColumns = { headers: string[]; types: ColumnType[]; decimals: DecimalType[]; sample: SheetRow[]; rows: number }

/**
 * Reads every row of the sheet once, as it streams in, and keeps of each column only what its type needs (see
 * `columnTypeReader`), so a file's length never adds to the memory it takes; `onProgress` gets the rows read so far.
 */
export const readColumns = async (source: SheetSource, sheet: string | undefined, onProgress: (rows: number) => void, signal?: AbortSignal): Promise<ReadColumns> => {
  let headers: string[] | undefined
  let readers: ReturnType<typeof columnTypeReader>[] = []
  const sample: SheetRow[] = []
  let rows = 0
  for await (const chunk of source.rows(sheet)) {
    signal?.throwIfAborted()
    for (const row of chunk) {
      if (!headers) {
        headers = row.cells.map(cellText)
        readers = headers.map(() => columnTypeReader())
        continue
      }
      if (row.cells.every(isEmptyCell)) continue
      rows++
      if (sample.length < sampleRows) sample.push(row)
      readers.forEach((reader, column) => reader.add(row.cells[column] ?? null))
    }
    onProgress(rows)
  }
  return { headers: headers ?? [], types: readers.map((reader) => reader.type()), decimals: readers.map((reader) => reader.decimal()), sample, rows }
}
