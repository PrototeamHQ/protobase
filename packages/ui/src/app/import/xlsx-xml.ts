import type { SheetCell, SheetRow } from './sheet-cell'
import { text as message } from './messages'

// The parts of an .xlsx's XML that an import reads: the sheets' names and files, the shared strings, which cell styles
// are dates, and the rows of a sheet, read with patterns over the text since a Web Worker has no DOMParser.

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/** The text with XML's entities and character references replaced by what they stand for. */
export const decodeXml = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (whole, name: string) => {
    if (name[0] !== '#') return entities[name.toLowerCase()] ?? whole
    return String.fromCodePoint(name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1)))
  })

/** An element's attributes, by name without their namespace prefix. */
export const attributes = (text: string) => {
  const found: Record<string, string> = {}
  for (const match of text.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    const name = match[1]!.slice(match[1]!.indexOf(':') + 1)
    found[name] = decodeXml(match[2] ?? match[3] ?? '')
  }
  return found
}

// The text of every <t> in a string item or inline string, without the phonetic runs (<rPh>) shown above the text
const runsText = (xml: string) =>
  xml
    .replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')
    .match(/<t\b[^>]*>[\s\S]*?<\/t>/g)
    ?.map((run) => decodeXml(run.replace(/^<t\b[^>]*>|<\/t>$/g, '')))
    .join('') ?? ''

/** The workbook's shared strings (xl/sharedStrings.xml), which text cells point at by index. */
export const sharedStrings = (xml: string) => [...xml.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)].map((match) => runsText(match[1] ?? ''))

export type WorkbookSheet = { name: string; path: string }

/**
 * The workbook's sheets in order, each with the path of its part in the archive, from xl/workbook.xml and its
 * relationships (xl/_rels/workbook.xml.rels); `date1904` when its dates count from 1904, as old Mac workbooks do.
 */
export const workbookSheets = (workbookXml: string, relsXml: string) => {
  const targets = new Map(
    [...relsXml.matchAll(/<Relationship\b([^>]*)>/g)].map((match) => {
      const { Id, Target } = attributes(match[1]!)
      return [Id, Target!.startsWith('/') ? Target!.slice(1) : `xl/${Target}`] as const
    }),
  )
  const sheets: WorkbookSheet[] = [...workbookXml.matchAll(/<sheet\b([^>]*)>/g)].map((match) => {
    const { name, id } = attributes(match[1]!)
    const path = targets.get(id)
    if (!name || !path) throw new Error(message('missingSheetPart'))
    return { name, path }
  })
  const pr = /<workbookPr\b([^>]*)>/.exec(workbookXml)
  const date1904 = pr ? ['1', 'true'].includes(attributes(pr[1]!).date1904 ?? '') : false
  return { sheets, date1904 }
}

// Excel's built-in number formats that show dates and times
const builtInDates = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58])

/** Whether a number format shows a date or time: it has d, m, y, h or s outside quoted text, colours and escapes. */
export const isDateFormat = (code: string) => /[dmyhs]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]|\\.|_.|\*./g, ''))

/** The indexes of the cell styles (xl/styles.xml's cellXfs) whose number format is a date or time. */
export const dateStyles = (xml: string) => {
  const custom = new Map([...xml.matchAll(/<numFmt\b([^>]*)>/g)].map((match) => {
    const { numFmtId, formatCode } = attributes(match[1]!)
    return [Number(numFmtId), formatCode ?? ''] as const
  }))
  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? ''
  const styles = new Set<number>()
  ;[...cellXfs.matchAll(/<xf\b([^>]*)>/g)].forEach((match, index) => {
    const id = Number(attributes(match[1]!).numFmtId ?? 0)
    if (builtInDates.has(id) || (custom.has(id) && isDateFormat(custom.get(id)!))) styles.add(index)
  })
  return styles
}

const pad = (value: number) => String(value).padStart(2, '0')

/**
 * A date cell's wall-clock time from its serial number, the days since the workbook's epoch: a date when it has no time
 * of day (`2026-03-01`), else to the second (`2026-03-01T14:30:00`). Excel's 1900 calendar counts a 29 February 1900
 * that never was, so serials before it are a day ahead.
 */
export const serialDate = (serial: number, date1904 = false) => {
  const days = date1904 ? serial + 1462 : serial < 60 ? serial + 1 : serial
  const at = new Date(Date.UTC(1899, 11, 30) + Math.round(days * 86400) * 1000)
  const date = `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`
  const seconds = at.getUTCHours() * 3600 + at.getUTCMinutes() * 60 + at.getUTCSeconds()
  return seconds === 0 ? date : `${date}T${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}:${pad(at.getUTCSeconds())}`
}

/** The 0-based column of a cell reference: `A1` is 0, `AB7` is 27. */
export const columnIndex = (ref: string) => {
  let index = 0
  for (const char of ref.toUpperCase()) {
    const code = char.charCodeAt(0)
    if (code < 65 || code > 90) break
    index = index * 26 + (code - 64)
  }
  return index - 1
}

export type SheetContext = { strings: string[]; dates: Set<number>; date1904: boolean }

const cellValue = (attrs: Record<string, string>, body: string, context: SheetContext): SheetCell => {
  const type = attrs.t ?? 'n'
  if (type === 'inlineStr') return runsText(body)
  const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1]
  if (raw === undefined) return null
  const value = decodeXml(raw)
  if (type === 's') return context.strings[Number(value)] ?? null
  if (type === 'b') return value === '1'
  if (type === 'str' || type === 'e') return value
  if (type === 'd') return { date: value.replace(/Z$/, '') }
  const number = Number(value)
  return context.dates.has(Number(attrs.s ?? 0)) ? { date: serialDate(number, context.date1904) } : number
}

/** One `<row>` element as a row of cells, each at its column; a row without a number follows `previous`. */
export const parseRow = (xml: string, context: SheetContext, previous: number): SheetRow => {
  const open = /^<row\b([^>]*)>/.exec(xml)
  const line = Number(attributes(open?.[1] ?? '').r ?? previous + 1)
  const cells: SheetCell[] = []
  for (const match of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = attributes(match[1]!)
    const column = attrs.r ? columnIndex(attrs.r) : cells.length
    while (cells.length < column) cells.push(null)
    cells[column] = cellValue(attrs, match[2] ?? '', context)
  }
  return { line, cells }
}

/**
 * A scanner fed a sheet's XML a chunk at a time, which returns the `<row>` elements each chunk completes, so a large
 * sheet is read without holding its text whole.
 */
export const createRowScanner = () => {
  let buffer = ''
  return (chunk: string) => {
    buffer += chunk
    const rows: string[] = []
    let end = 0
    for (const match of buffer.matchAll(/<row\b[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g)) {
      rows.push(match[0])
      end = match.index + match[0].length
    }
    buffer = buffer.slice(end)
    return rows
  }
}
