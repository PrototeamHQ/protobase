import { describe, expect, it } from 'vitest'
import type { FieldModel, FieldViewModel } from '@protobase/schema'
import { csvText, numberFormat, xlsxCell, type ExportColumn } from './cells'

const column = (type: FieldModel['type'], hints: FieldViewModel = {}, name = 'x'): ExportColumn => ({
  name,
  header: 'X',
  field: { name, column: name, type, nullable: true, readOnly: false, filterable: false, sortable: false, aliases: [] },
  hints,
})

const labels = { customer: { '7': 'Acme' } }

describe('csvText', () => {
  it('shows values as the list does', () => {
    expect(csvText(column('enum', { valueLabels: { paid: 'Paid in full' } }), 'paid', {}, 'shown')).toBe('Paid in full')
    expect(csvText(column('decimal', { prefix: '€', decimals: 2 }), '1234.5', {}, 'shown')).toBe('€1,234.50')
    expect(csvText(column('date'), '2026-10-06', {}, 'shown')).toBe('6 Oct 2026')
    expect(csvText(column('boolean'), false, {}, 'shown')).toBe('No')
  })

  it('names a related record by its label, and by its key without one', () => {
    expect(csvText(column('relation', {}, 'customer'), 7, labels, 'shown')).toBe('Acme')
    expect(csvText(column('relation', {}, 'customer'), 8, labels, 'shown')).toBe('8')
    expect(csvText(column('relation', {}, 'customer'), 7, labels, 'raw')).toBe('7')
  })

  it('gives raw values as the API sends them, and nothing for no value', () => {
    expect(csvText(column('enum'), 'paid', {}, 'raw')).toBe('paid')
    expect(csvText(column('decimal'), '1234.50', {}, 'raw')).toBe('1234.50')
    expect(csvText(column('timestamp'), '2026-10-06T09:41:00.000Z', {}, 'raw')).toBe('2026-10-06T09:41:00.000Z')
    expect(csvText(column('boolean'), true, {}, 'raw')).toBe('true')
    expect(csvText(column('json'), { a: 1 }, {}, 'raw')).toBe('{"a":1}')
    expect(csvText(column('text'), null, {}, 'shown')).toBe('')
  })

  it("gives a file's name as shown and its stored uri raw", () => {
    const file = { uri: 'private:a/b.pdf', name: 'Contract.pdf', type: 'application/pdf', url: 'https://files.example.com/a/b.pdf?sig=1' }
    expect(csvText(column('file'), file, {}, 'shown')).toBe('Contract.pdf')
    expect(csvText(column('file'), file, {}, 'raw')).toBe('private:a/b.pdf')
  })
})

describe('numberFormat', () => {
  it("follows the view's decimals, prefix and suffix", () => {
    expect(numberFormat({ prefix: '€', decimals: 2 })).toBe('\\€#,##0.00')
    expect(numberFormat({ suffix: ' m²' })).toBe('General\\ \\m\\²')
    expect(numberFormat({ decimals: 0 })).toBe('#,##0')
    expect(numberFormat({ format: 'percent' })).toBe('General\\%')
    expect(numberFormat({})).toBeUndefined()
  })
})

describe('xlsxCell', () => {
  it('keeps numbers, dates and booleans typed', () => {
    expect(xlsxCell(column('integer'), 42, {}, 'raw')).toEqual({ kind: 'number', value: 42 })
    expect(xlsxCell(column('decimal', { prefix: '€', decimals: 2 }), '9.95', {}, 'shown')).toEqual({ kind: 'number', value: 9.95, format: '\\€#,##0.00' })
    expect(xlsxCell(column('boolean'), true, {}, 'shown')).toEqual({ kind: 'boolean', value: true })
    expect(xlsxCell(column('date'), '2026-10-16', {}, 'shown')).toEqual({ kind: 'number', value: 46311, format: 'd mmm yyyy' })
    expect(xlsxCell(column('timestamp'), '2026-10-16T12:00:00.000Z', {}, 'raw')).toEqual({ kind: 'number', value: 46311.5, format: 'yyyy-mm-dd hh:mm:ss' })
  })

  it('keeps a bigint past 2^53 as text, so no digit is lost', () => {
    expect(xlsxCell(column('bigint'), '9007199254740993', {}, 'raw')).toEqual({ kind: 'text', value: '9007199254740993' })
    expect(xlsxCell(column('bigint'), '12', {}, 'raw')).toEqual({ kind: 'number', value: 12 })
  })

  it('gives labels as text as shown, and keys raw', () => {
    expect(xlsxCell(column('relation', {}, 'customer'), 7, labels, 'shown')).toEqual({ kind: 'text', value: 'Acme' })
    expect(xlsxCell(column('relation', {}, 'customer'), 7, labels, 'raw')).toEqual({ kind: 'number', value: 7 })
    expect(xlsxCell(column('enum', { valueLabels: { a: 'Alpha' } }), 'a', {}, 'shown')).toEqual({ kind: 'text', value: 'Alpha' })
    expect(xlsxCell(column('text'), '', {}, 'shown')).toEqual({ kind: 'empty' })
  })
})
