import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import type { FieldModel } from '@protobase/schema'
import type { ExportColumn } from './cells'
import { columnWidths, createExportBuilder, type ExportPlan, type ExportRecord } from './builder'
import { csvField, csvTextField } from './csv'
import { columnLetters } from './xlsx'

const column = (name: string, header: string, type: FieldModel['type'], hints = {}): ExportColumn => ({
  name,
  header,
  field: { name, column: name, type, nullable: true, readOnly: false, filterable: false, sortable: false, aliases: [] },
  hints,
})

const columns = [column('number', 'Number', 'text'), column('total', 'Total', 'decimal', { prefix: '€', decimals: 2 }), column('paid', 'Paid', 'boolean'), column('booked_on', 'Booked on', 'date')]
const records: ExportRecord[] = [
  { number: 'SO-1', total: '12.50', paid: true, booked_on: '2026-10-16' },
  { number: '=cmd, "x"', total: null, paid: false, booked_on: null },
]

const build = (plan: ExportPlan, pages: ExportRecord[][]) => {
  const chunks: Uint8Array[] = []
  const builder = createExportBuilder(plan, (chunk) => chunks.push(chunk))
  for (const page of pages) builder.page(page, {})
  builder.finish()
  const bytes = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0))
  chunks.reduce((offset, chunk) => (bytes.set(chunk, offset), offset + chunk.length), 0)
  return bytes
}

describe('csv', () => {
  it('quotes fields as RFC 4180 does', () => {
    expect(csvField('plain')).toBe('plain')
    expect(csvField('a,b')).toBe('"a,b"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
    expect(csvField('two\nlines')).toBe('"two\nlines"')
  })

  it('keeps text that starts like a formula from running', () => {
    expect(csvTextField('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(csvTextField('-5 apples')).toBe("'-5 apples")
  })

  it('writes a UTF-8 file with a byte order mark, a header of labels and CRLF lines', () => {
    const bytes = build({ format: 'csv', mode: 'shown', name: 'Orders', columns }, [records])
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(new TextDecoder().decode(bytes.slice(3))).toBe('Number,Total,Paid,Booked on\r\nSO-1,€12.50,Yes,16 Oct 2026\r\n"\'=cmd, ""x""",,No,\r\n')
  })

  it('writes raw values as the API sends them', () => {
    const bytes = build({ format: 'csv', mode: 'raw', name: 'Orders', columns }, [records.slice(0, 1)])
    expect(new TextDecoder().decode(bytes.slice(3))).toBe('Number,Total,Paid,Booked on\r\nSO-1,12.50,true,2026-10-16\r\n')
  })
})

describe('xlsx', () => {
  it('names columns as Excel does', () => {
    expect([0, 25, 26, 27, 701, 702].map(columnLetters)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA'])
  })

  it('sizes columns for their header and the first values', () => {
    expect(columnWidths(columns, records, {})).toEqual([11, 8, 8, 13])
  })

  it('writes a workbook with a frozen bold header and typed cells', () => {
    const files = unzipSync(build({ format: 'xlsx', mode: 'shown', name: 'Orders: 2026', columns }, [records.slice(0, 1), records.slice(1)]))
    expect(Object.keys(files).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml'])
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml']!)
    expect(sheet).toContain('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>')
    expect(sheet).toContain('<col min="4" max="4" width="13" customWidth="1"/>')
    expect(sheet).toContain('<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Number</t></is></c>')
    expect(sheet).toContain('<row r="2"><c r="A2" t="inlineStr"><is><t xml:space="preserve">SO-1</t></is></c><c r="B2" s="2"><v>12.5</v></c><c r="C2" t="b"><v>1</v></c><c r="D2" s="3"><v>46311</v></c></row>')
    // Text stays text in a workbook, escaped for XML; empty cells are left out
    expect(sheet).toContain('<row r="3"><c r="A3" t="inlineStr"><is><t xml:space="preserve">=cmd, &quot;x&quot;</t></is></c><c r="C3" t="b"><v>0</v></c></row>')
    const styles = strFromU8(files['xl/styles.xml']!)
    expect(styles).toContain('<numFmt numFmtId="164" formatCode="\\€#,##0.00"/><numFmt numFmtId="165" formatCode="d mmm yyyy"/>')
    expect(styles).toContain('<cellXfs count="4">')
    expect(strFromU8(files['xl/workbook.xml']!)).toContain('<sheet name="Orders  2026" sheetId="1" r:id="rId1"/>')
  })

  it('writes a header alone when no record matches', () => {
    const sheet = strFromU8(unzipSync(build({ format: 'xlsx', mode: 'raw', name: 'Orders', columns }, []))['xl/worksheets/sheet1.xml']!)
    expect(sheet).toMatch(/<sheetData><row r="1">.*<\/row><\/sheetData><\/worksheet>$/)
  })

  it('drops characters XML cannot hold', () => {
    const sheet = strFromU8(unzipSync(build({ format: 'xlsx', mode: 'raw', name: 'Orders', columns: columns.slice(0, 1) }, [[{ number: 'a\u0001b' }]]))['xl/worksheets/sheet1.xml']!)
    expect(sheet).toContain('<t xml:space="preserve">ab</t>')
  })
})
