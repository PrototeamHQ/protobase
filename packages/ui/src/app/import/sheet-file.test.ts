import { describe, expect, it } from 'vitest'
import { buildWorkbook } from '../testing/xlsx-fixture'
import { sheetFormat, sheetNames, sheetRows } from './sheet-file'

const collect = async (rows: AsyncGenerator<unknown>) => {
  const found = []
  for await (const row of rows) found.push(row)
  return found
}

describe('sheet files', () => {
  it('reads a CSV as text rows numbered as a spreadsheet numbers them', async () => {
    const file = new File(['name;city\nAcme;Delft\n'], 'customers.csv')
    expect(await sheetFormat(file)).toBe('csv')
    expect(await sheetNames(file)).toEqual([])
    expect(await collect(sheetRows(file))).toEqual([
      { line: 1, cells: ['name', 'city'] },
      { line: 2, cells: ['Acme', 'Delft'] },
    ])
  })

  it('refuses a CSV that is not UTF-8 instead of reading it with replacement characters', async () => {
    const file = new File([new Uint8Array([0x6e, 0x61, 0x6d, 0x65, 0x0a, 0x43, 0x61, 0x66, 0xe9, 0x0a])], 'latin.csv')
    await expect(collect(sheetRows(file))).rejects.toThrow('not UTF-8')
  })

  it('reads the chosen sheet of a workbook, also one without an extension', async () => {
    const blob = await buildWorkbook({ First: [['a'], [1]], Second: [['b'], ['x']] })
    const file = new File([blob], 'export')
    expect(await sheetFormat(file)).toBe('xlsx')
    expect(await sheetNames(file)).toEqual(['First', 'Second'])
    expect(await collect(sheetRows(file, 'Second'))).toEqual([
      { line: 1, cells: ['b'] },
      { line: 2, cells: ['x'] },
    ])
  })
})
