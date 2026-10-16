import { describe, expect, it } from 'vitest'
import { buildWorkbook } from '../testing/xlsx-fixture'
import { openWorkbook } from './xlsx-reader'

describe('openWorkbook', () => {
  it('names the sheets and streams the rows of the one asked for', async () => {
    const blob = await buildWorkbook({
      Customers: [
        ['Name', 'Since', 'Active', 'Visits'],
        ['Acme & Co', { serial: 46082 }, true, 12],
        ['Globex', null, false, 3.5],
      ],
      Notes: [['Text'], ['hello']],
    })
    const workbook = await openWorkbook(blob)
    expect(workbook.sheets).toEqual(['Customers', 'Notes'])
    const rows = []
    for await (const row of workbook.rows('Customers')) rows.push(row)
    expect(rows).toEqual([
      { line: 1, cells: ['Name', 'Since', 'Active', 'Visits'] },
      { line: 2, cells: ['Acme & Co', { date: '2026-03-01' }, true, 12] },
      { line: 3, cells: ['Globex', null, false, 3.5] },
    ])
  })

  it('refuses a file that is no workbook', async () => {
    await expect(openWorkbook(new Blob(['name,email\n']))).rejects.toThrow('not an Excel workbook')
  })
})
