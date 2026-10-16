import { Zip, ZipDeflate } from 'fflate'
import type { Cell } from './cells'

/** The most data rows a sheet holds: Excel's 1,048,576 rows, less the header. */
export const xlsxMaxRows = 1_048_575

// Excel refuses a cell of more text than this.
const maxCellText = 32_767

// Characters XML 1.0 cannot hold at all, which would make the file unreadable.
const invalidXml = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g

const escapeXml = (text: string) =>
  text.replace(invalidXml, '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

/** A column's letters: 0 is A, 25 is Z, 26 is AA. */
export const columnLetters = (index: number): string => {
  const letter = String.fromCharCode(65 + (index % 26))
  return index < 26 ? letter : columnLetters(Math.floor(index / 26) - 1) + letter
}

const textCell = (ref: string, text: string, style = '') =>
  `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(text.slice(0, maxCellText))}</t></is></c>`

const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const mainNs = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const relNs = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const packageRelNs = 'http://schemas.openxmlformats.org/package/2006/relationships'

const contentTypes = `${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`
const rootRels = `${xml}<Relationships xmlns="${packageRelNs}"><Relationship Id="rId1" Type="${relNs}/officeDocument" Target="xl/workbook.xml"/></Relationships>`
const workbookRels = `${xml}<Relationships xmlns="${packageRelNs}"><Relationship Id="rId1" Type="${relNs}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${relNs}/styles" Target="styles.xml"/></Relationships>`

// A sheet name is at most 31 characters, without : \ / ? * [ ]
const sheetName = (name: string) => name.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31).trim() || 'Sheet1'

const workbook = (name: string) =>
  `${xml}<workbook xmlns="${mainNs}" xmlns:r="${relNs}"><sheets><sheet name="${escapeXml(sheetName(name))}" sheetId="1" r:id="rId1"/></sheets></workbook>`

// Style 0 is the default and 1 the bold header; each number format after them gets a style of its own, from 2.
const styles = (formats: string[]) => {
  const numFmts = formats.map((code, index) => `<numFmt numFmtId="${164 + index}" formatCode="${escapeXml(code)}"/>`).join('')
  const xfs = formats.map((_, index) => `<xf numFmtId="${164 + index}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`).join('')
  return `${xml}<styleSheet xmlns="${mainNs}">${formats.length > 0 ? `<numFmts count="${formats.length}">${numFmts}</numFmts>` : ''}<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${2 + formats.length}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>${xfs}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`
}

const encoder = new TextEncoder()

export type XlsxSheet = {
  /** The sheet's name: the resource's label. */
  name: string
  headers: string[]
  /** Each column's width in characters. */
  widths: number[]
}

/**
 * Writes a one-sheet .xlsx file as it goes, handing each compressed piece to `onChunk`: a bold, frozen header row, then
 * `rows` as often as they come, and `finish` once. Text is written inline in its cell rather than in a table of shared
 * strings, so the writer holds no more than the rows it is given.
 */
export const createXlsxWriter = (sheet: XlsxSheet, onChunk: (chunk: Uint8Array, final: boolean) => void) => {
  const zip = new Zip((error, chunk, final) => {
    if (error) throw error
    onChunk(chunk, final)
  })
  const add = (path: string, text: string) => {
    const file = new ZipDeflate(path, { level: 6 })
    zip.add(file)
    file.push(encoder.encode(text), true)
  }
  add('[Content_Types].xml', contentTypes)
  add('_rels/.rels', rootRels)
  add('xl/workbook.xml', workbook(sheet.name))
  add('xl/_rels/workbook.xml.rels', workbookRels)

  const worksheet = new ZipDeflate('xl/worksheets/sheet1.xml', { level: 6 })
  zip.add(worksheet)
  const cols = sheet.widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')
  const frozen = '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
  const header = `<row r="1">${sheet.headers.map((text, index) => textCell(`${columnLetters(index)}1`, text, ' s="1"')).join('')}</row>`
  worksheet.push(encoder.encode(`${xml}<worksheet xmlns="${mainNs}">${frozen}${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${header}`))

  const letters = sheet.headers.map((_, index) => columnLetters(index))
  const formats: string[] = []
  const styleOf = (format: string) => {
    const index = formats.indexOf(format)
    if (index >= 0) return index + 2
    formats.push(format)
    return formats.length + 1
  }
  const cellXml = (cell: Cell, ref: string) => {
    switch (cell.kind) {
      case 'empty':
        return ''
      case 'text':
        return textCell(ref, cell.value)
      case 'boolean':
        return `<c r="${ref}" t="b"><v>${cell.value ? 1 : 0}</v></c>`
      case 'number':
        return `<c r="${ref}"${cell.format ? ` s="${styleOf(cell.format)}"` : ''}><v>${cell.value}</v></c>`
    }
  }

  let rowNumber = 1
  const rows = (cells: Cell[][]) => {
    let text = ''
    for (const row of cells) {
      rowNumber += 1
      if (rowNumber > xlsxMaxRows + 1) throw new Error(`A sheet holds at most ${xlsxMaxRows} rows`)
      text += `<row r="${rowNumber}">${row.map((cell, index) => cellXml(cell, `${letters[index]}${rowNumber}`)).join('')}</row>`
    }
    worksheet.push(encoder.encode(text))
  }

  const finish = () => {
    worksheet.push(encoder.encode('</sheetData></worksheet>'), true)
    add('xl/styles.xml', styles(formats))
    zip.end()
  }

  return { rows, finish }
}
