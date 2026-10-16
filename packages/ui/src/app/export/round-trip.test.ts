import { describe, expect, it } from 'vitest'
import type { FieldModel } from '@protobase/schema'
import { openWorkbook } from '../import/xlsx-reader'
import { createExportBuilder } from './builder'
import type { ExportColumn } from './cells'

const column = (name: string, header: string, type: FieldModel['type'], hints = {}): ExportColumn => ({
  name,
  header,
  field: { name, column: name, type, nullable: true, readOnly: false, filterable: false, sortable: false, aliases: [] },
  hints,
})

// What Export writes, Import reads back: the same headers, and each cell its type (the reader ends a row at its last value).
describe('an exported workbook, imported', () => {
  it('reads back as it was written', async () => {
    const chunks: Uint8Array[] = []
    const columns = [column('number', 'Number', 'text'), column('total', 'Total', 'decimal', { prefix: '€', decimals: 2 }), column('paid', 'Paid', 'boolean'), column('due', 'Due', 'date')]
    const builder = createExportBuilder({ format: 'xlsx', mode: 'raw', name: 'Invoices', columns }, (chunk) => chunks.push(chunk))
    builder.page([{ number: 'INV-1 & co', total: '12.50', paid: true, due: '2026-03-01' }, { number: 'INV-2', total: null, paid: false, due: null }], {})
    builder.finish()

    const workbook = await openWorkbook(new Blob(chunks as BlobPart[]))
    expect(workbook.sheets).toEqual(['Invoices'])
    const rows = []
    for await (const row of workbook.rows('Invoices')) rows.push(row)
    expect(rows).toEqual([
      { line: 1, cells: ['Number', 'Total', 'Paid', 'Due'] },
      { line: 2, cells: ['INV-1 & co', 12.5, true, { date: '2026-03-01' }] },
      { line: 3, cells: ['INV-2', null, false] },
    ])
  })
})
