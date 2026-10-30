// Small .xlsx workbooks for tests and stories, built the way Excel stores them: text in shared strings, numbers and
// booleans in the cells, dates as serial numbers with a date style, every part deflated in a ZIP archive.

import { strToU8, zipSync } from 'fflate'

export type FixtureCell = string | number | boolean | { serial: number } | null

/** A ZIP archive of the files, each deflated, with their sizes in the local headers as Excel writes them. */
export const zipFiles = async (files: Record<string, string>) => {
  const entries = Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)]))
  // A fixed date keeps the archive's bytes independent of the clock
  const archive = zipSync(entries, { level: 6, mtime: new Date(2000, 0, 1) })
  return new Blob([archive as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const columnName = (index: number): string => (index < 26 ? String.fromCharCode(65 + index) : columnName(Math.floor(index / 26) - 1) + columnName(index % 26))

/** An .xlsx workbook with these sheets, by name, each a list of rows of cells. */
export const buildWorkbook = async (sheets: Record<string, FixtureCell[][]>) => {
  const strings: string[] = []
  const stringIndex = (text: string) => {
    const at = strings.indexOf(text)
    if (at >= 0) return at
    strings.push(text)
    return strings.length - 1
  }
  const cellXml = (cell: FixtureCell, ref: string) => {
    if (cell === null) return ''
    if (typeof cell === 'string') return `<c r="${ref}" t="s"><v>${stringIndex(cell)}</v></c>`
    if (typeof cell === 'boolean') return `<c r="${ref}" t="b"><v>${cell ? 1 : 0}</v></c>`
    if (typeof cell === 'number') return `<c r="${ref}"><v>${cell}</v></c>`
    return `<c r="${ref}" s="1"><v>${cell.serial}</v></c>`
  }
  const sheetXml = (rows: FixtureCell[][]) =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows
      .map((row, index) => `<row r="${index + 1}">${row.map((cell, column) => cellXml(cell, `${columnName(column)}${index + 1}`)).join('')}</row>`)
      .join('')}</sheetData></worksheet>`
  const names = Object.keys(sheets)
  const sheetFiles = Object.fromEntries(names.map((name, index) => [`xl/worksheets/sheet${index + 1}.xml`, sheetXml(sheets[name]!)]))
  return zipFiles({
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
      .map((name, index) => `<sheet name="${escape(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
      .join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names
      .map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`)
      .join('')}</Relationships>`,
    'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/></cellXfs></styleSheet>',
    ...sheetFiles,
    // The sheets above filled it
    'xl/sharedStrings.xml': `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${strings.map((text) => `<si><t xml:space="preserve">${escape(text)}</t></si>`).join('')}</sst>`,
  })
}
