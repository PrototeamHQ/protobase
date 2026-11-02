import { createCsvParser } from './csv-chunks'
import { jsonRows } from './json-rows'
import type { SheetRow } from './sheet-cell'
import { openWorkbook } from './xlsx-reader'
import { text } from './messages'

/** The file kinds an import reads. */
export type SheetFormat = 'xlsx' | 'csv' | 'json'

/** Whether the file is JSON, by its name's extension or its media type. */
export const isJsonFile = (file: File) => /\.json$/i.test(file.name) || file.type.split(';')[0]!.trim().toLowerCase() === 'application/json'

// An .xlsx is a ZIP archive, which starts with "PK"
const startsAsZip = async (file: Blob) => {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer())
  return head[0] === 0x50 && head[1] === 0x4b
}

/** Whether the file is a workbook, CSV text or JSON: by its name's extension, else by whether it is a ZIP archive. */
export const sheetFormat = async (file: File): Promise<SheetFormat> => {
  if (isJsonFile(file)) return 'json'
  const extension = /\.([^.]+)$/.exec(file.name)?.[1]?.toLowerCase()
  if (extension === 'xlsx') return 'xlsx'
  if (extension === 'csv' || extension === 'tsv' || extension === 'txt') return 'csv'
  return (await startsAsZip(file)) ? 'xlsx' : 'csv'
}

/** The workbook's sheet names, in order; a CSV or JSON file has none. */
export const sheetNames = async (file: File) => ((await sheetFormat(file)) === 'xlsx' ? (await openWorkbook(file)).sheets : [])

const notText = () => new Error(text('fileNotUtf8'))

async function* csvRows(file: Blob): AsyncGenerator<SheetRow> {
  const parser = createCsvParser()
  // Fatal, so a file in another encoding is refused rather than read with replacement characters
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const decode = (bytes?: Uint8Array) => {
    try {
      return bytes ? decoder.decode(bytes, { stream: true }) : decoder.decode()
    } catch (error) {
      if (error instanceof TypeError) throw notText()
      throw error
    }
  }
  const reader = file.stream().getReader()
  let line = 0
  const numbered = (rows: string[][]) => rows.map((cells) => ({ line: ++line, cells }))
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      yield* numbered(parser.push(decode(value)))
    }
    yield* numbered([...parser.push(decode()), ...parser.end()])
  } finally {
    await reader.cancel()
  }
}

/**
 * The rows of the file, the header first: a CSV's (UTF-8, with its delimiter found from the header line) or the named
 * sheet of a workbook, read as the file streams in, or a JSON file's objects, read whole.
 */
export async function* sheetRows(file: File, sheet?: string): AsyncGenerator<SheetRow> {
  const format = await sheetFormat(file)
  if (format === 'csv') return yield* csvRows(file)
  if (format === 'json') return yield* await jsonRows(file)
  const workbook = await openWorkbook(file)
  const name = sheet ?? workbook.sheets[0]
  if (name === undefined) throw new Error(text('noSheets'))
  yield* workbook.rows(name)
}
