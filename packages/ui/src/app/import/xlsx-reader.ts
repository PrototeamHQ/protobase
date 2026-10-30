import type { SheetRow } from './sheet-cell'
import { createRowScanner, dateStyles, parseRow, sharedStrings, workbookSheets, type SheetContext } from './xlsx-xml'
import { zipEntries, zipText, zipTextChunks, type ZipEntry } from './zip-reader'
import { text } from './messages'

const part = (entries: Map<string, ZipEntry>, name: string) => {
  const entry = entries.get(name)
  if (!entry) throw new Error(text('notWorkbook', { part: name }))
  return entry
}

/**
 * An .xlsx workbook: the names of its sheets, and each sheet's rows read as its XML streams in. The shared strings and
 * the styles are read whole, since cells point into them; the sheets are not.
 */
export const openWorkbook = async (blob: Blob) => {
  const entries = await zipEntries(blob)
  const { sheets, date1904 } = workbookSheets(await zipText(blob, part(entries, 'xl/workbook.xml')), await zipText(blob, part(entries, 'xl/_rels/workbook.xml.rels')))
  let context: SheetContext | undefined
  const sheetContext = async () => {
    const strings = entries.has('xl/sharedStrings.xml') ? sharedStrings(await zipText(blob, entries.get('xl/sharedStrings.xml')!)) : []
    const dates = entries.has('xl/styles.xml') ? dateStyles(await zipText(blob, entries.get('xl/styles.xml')!)) : new Set<number>()
    context = { strings, dates, date1904 }
    return context
  }

  async function* rows(name: string): AsyncGenerator<SheetRow> {
    const sheet = sheets.find((candidate) => candidate.name === name)
    if (!sheet) throw new Error(text('noSheetCalled', { name }))
    const shared = context ?? (await sheetContext())
    const scan = createRowScanner()
    let line = 0
    for await (const chunk of zipTextChunks(blob, part(entries, sheet.path))) {
      for (const xml of scan(chunk)) {
        const row = parseRow(xml, shared, line)
        line = row.line
        yield row
      }
    }
  }

  return { sheets: sheets.map((sheet) => sheet.name), rows }
}
