import { describe, expect, it } from 'vitest'
import { columnIndex, createRowScanner, dateStyles, decodeXml, isDateFormat, parseRow, serialDate, sharedStrings, workbookSheets } from './xlsx-xml'

describe('decodeXml', () => {
  it('replaces entities and character references', () => {
    expect(decodeXml('Smith &amp; Sons &lt;&#8364;&#x41;&gt; &quot;a&apos;')).toBe(`Smith & Sons <€A> "a'`)
  })
})

describe('sharedStrings', () => {
  it('joins rich text runs, leaves out phonetic runs and keeps empty items in their place', () => {
    const xml = '<sst><si><t>plain</t></si><si/><si><r><t>bo</t></r><r><rPr/><t xml:space="preserve">ld </t></r><rPh><t>x</t></rPh></si></sst>'
    expect(sharedStrings(xml)).toEqual(['plain', '', 'bold '])
  })
})

describe('workbookSheets', () => {
  it('names the sheets in order with their parts, and reads the 1904 calendar', () => {
    const workbook = '<workbook><workbookPr date1904="1"/><sheets><sheet name="Q&amp;A" sheetId="2" r:id="rId2"/><sheet r:id="rId1" name="Data" sheetId="1"/></sheets></workbook>'
    const rels = '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/qa.xml"/></Relationships>'
    expect(workbookSheets(workbook, rels)).toEqual({ sheets: [{ name: 'Q&A', path: 'xl/worksheets/qa.xml' }, { name: 'Data', path: 'xl/worksheets/sheet1.xml' }], date1904: true })
  })
})

describe('dates', () => {
  it('knows a date format by its letters outside quotes, colours and escapes', () => {
    expect(isDateFormat('dd/mm/yyyy')).toBe(true)
    expect(isDateFormat('[h]:mm')).toBe(true)
    expect(isDateFormat('#,##0.00 "days"')).toBe(false)
    expect(isDateFormat('[Red]0.00')).toBe(false)
    expect(isDateFormat('General')).toBe(false)
  })

  it('finds the cell styles with built-in or custom date formats', () => {
    const xml = '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="d mmm yyyy"/><numFmt numFmtId="165" formatCode="0.0%"/></numFmts><cellStyleXfs><xf numFmtId="14"/></cellStyleXfs><cellXfs><xf numFmtId="0"/><xf numFmtId="14"><alignment/></xf><xf numFmtId="164"/><xf numFmtId="165"/></cellXfs></styleSheet>'
    expect(dateStyles(xml)).toEqual(new Set([1, 2]))
  })

  it('turns serial numbers into wall-clock dates and times', () => {
    expect(serialDate(46082)).toBe('2026-03-01')
    expect(serialDate(46082.6041666667)).toBe('2026-03-01T14:30:00')
    expect(serialDate(1)).toBe('1900-01-01')
    expect(serialDate(61)).toBe('1900-03-01')
    expect(serialDate(0, true)).toBe('1904-01-01')
  })
})

describe('rows', () => {
  const context = { strings: ['Name', 'Acme'], dates: new Set([1]), date1904: false }

  it('reads each cell by its type at its column, leaving gaps empty', () => {
    const xml = '<row r="4"><c r="A4" t="s"><v>1</v></c><c r="C4" s="1"><v>46082</v></c><c r="D4" t="b"><v>0</v></c><c r="E4" t="inlineStr"><is><t>in &amp; line</t></is></c><c r="F4" t="str"><v>x</v></c><c r="G4"><v>1.5</v></c><c r="H4"/></row>'
    expect(parseRow(xml, context, 3)).toEqual({ line: 4, cells: ['Acme', null, { date: '2026-03-01' }, false, 'in & line', 'x', 1.5, null] })
  })

  it('numbers a row without its own number after the one before', () => {
    expect(parseRow('<row><c><v>2</v></c><c><v>3</v></c></row>', context, 6)).toEqual({ line: 7, cells: [2, 3] })
  })

  it('counts columns past Z', () => {
    expect(columnIndex('A1')).toBe(0)
    expect(columnIndex('AB7')).toBe(27)
  })

  it('finds the rows a chunk completes, wherever the chunks split', () => {
    const xml = '<sheetData><row r="1"><c><v>1</v></c></row><row r="2"/><row r="3"><c><v>3</v></c></row></sheetData>'
    for (const size of [1, 4, 7, xml.length]) {
      const scan = createRowScanner()
      const rows: string[] = []
      for (let at = 0; at < xml.length; at += size) rows.push(...scan(xml.slice(at, at + size)))
      expect(rows).toEqual(['<row r="1"><c><v>1</v></c></row>', '<row r="2"/>', '<row r="3"><c><v>3</v></c></row>'])
    }
  })
})
