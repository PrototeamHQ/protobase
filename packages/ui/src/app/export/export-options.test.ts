import { describe, expect, it } from 'vitest'
import type { FieldModel, ResourceModel, ViewModel } from '@protobase/schema'
import { defaultExportColumns, exportableFields, exportColumns, exportLimit, exportOffered, exportsSelection, selectionFilters } from './export-options'
import { exportFileName } from './sink'

const field = (name: string, type: FieldModel['type'], extra: Partial<FieldModel> = {}) =>
  ({ name, column: name, type, nullable: false, readOnly: false, filterable: false, sortable: false, aliases: [], ...extra }) as FieldModel

const orders = {
  name: 'orders',
  primaryKey: ['id'],
  fields: { id: field('id', 'integer'), number: field('number', 'text'), status: field('status', 'enum'), iban: field('iban', 'text', { sensitive: true }), total: field('total', 'decimal') },
} as unknown as ResourceModel

const view = { resource: 'orders', list: { columns: ['number', 'iban', 'status'] }, fields: { status: { label: 'State', valueLabels: { a: 'A' } } }, filters: [], layout: [], actions: [] } as unknown as ViewModel

describe('export options', () => {
  it('offers every readable field but the sensitive ones, starting with the list columns', () => {
    expect(exportableFields(orders)).toEqual(['id', 'number', 'status', 'total'])
    expect(defaultExportColumns(orders, view)).toEqual(['number', 'status'])
    expect(defaultExportColumns(orders, undefined)).toEqual(['id', 'number', 'status', 'total'])
  })

  it("heads each column with the field's label and carries the view's hints", () => {
    expect(exportColumns(orders, view, ['status', 'number']).map(({ name, header, hints }) => ({ name, header, hints }))).toEqual([
      { name: 'status', header: 'State', hints: { label: 'State', valueLabels: { a: 'A' } } },
      { name: 'number', header: 'Number', hints: {} },
    ])
  })

  it("is offered unless the view takes it off, up to the view's limit and a sheet's", () => {
    expect(exportOffered(view)).toBe(true)
    expect(exportOffered({ ...view, export: false })).toBe(false)
    expect(exportLimit(view, 'csv')).toBe(Infinity)
    expect(exportLimit(view, 'xlsx')).toBe(1_048_575)
    expect(exportLimit({ ...view, export: { maxRows: 5000 } }, 'xlsx')).toBe(5000)
  })

  it('finds selected records again by their key, 500 to a filter', () => {
    const keys = Array.from({ length: 1001 }, (_, index) => index + 1)
    const filters = selectionFilters(orders, keys)
    expect(filters).toHaveLength(3)
    expect(filters[2]).toBe('in(id, 1001)')
    expect(selectionFilters(orders, ['a', 'b'])).toEqual(['in(id, "a", "b")'])
    expect(exportsSelection({ ...orders, primaryKey: ['order_id', 'line'] })).toBe(false)
  })

  it('names the file after the records and the day', () => {
    expect(exportFileName('Orders', 'xlsx', new Date(2026, 9, 16))).toBe('Orders 2026-10-16.xlsx')
    expect(exportFileName('Leads / prospects', 'csv', new Date(2026, 0, 2))).toBe('Leads   prospects 2026-01-02.csv')
  })
})
