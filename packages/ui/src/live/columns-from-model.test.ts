import { describe, expect, it } from 'vitest'
import type { FieldModel, ResourceModel, ViewModel } from '@protobase/schema'
import { columnsFromModel } from './columns-from-model'

const field = (name: string, type: FieldModel['type'], extra: Partial<FieldModel> = {}): FieldModel =>
  ({ name, column: name, type, nullable: false, readOnly: false, filterable: false, sortable: false, aliases: [], ...extra }) as FieldModel

const model = {
  name: 'orders',
  table: { name: 'orders' },
  primaryKey: ['id'],
  fields: {
    number: field('number', 'text', { sortable: true }),
    companyId: field('companyId', 'relation', { relation: { resource: 'companies', columns: ['company_id'] } }),
    status: field('status', 'enum', { enumValues: ['draft', 'shipped', 'on_hold'] }),
    total: field('total', 'decimal'),
    discountPercent: field('discountPercent', 'decimal'),
    createdAt: field('createdAt', 'timestamp'),
  },
} as unknown as ResourceModel

const view = {
  resource: 'orders',
  fields: { total: { prefix: '€', decimals: 2 }, discountPercent: { label: 'Discount', format: 'percent' }, status: { valueLabels: { shipped: 'Sent out' } } },
  list: { columns: ['number', 'companyId', 'status', 'total', 'discountPercent', 'createdAt', 'missing'] },
} as unknown as ViewModel

describe('columnsFromModel', () => {
  const columns = columnsFromModel(model, view, ['discountPercent'])
  const byId = Object.fromEntries(columns.map((column) => [column.id, column]))

  it('follows the list and skips unknown fields', () => {
    expect(columns.map((column) => column.id)).toEqual(['number', 'companyId', 'status', 'total', 'discountPercent', 'createdAt'])
  })

  it('maps field types and view hints to column kinds', () => {
    expect(byId.number).toMatchObject({ kind: 'id', sortable: true })
    expect(byId.companyId).toMatchObject({ kind: 'relation', header: 'Company' })
    expect(byId.status).toMatchObject({ kind: 'status', tones: { draft: 'neutral', shipped: 'violet', on_hold: 'neutral' }, labels: { draft: 'draft', shipped: 'Sent out', on_hold: 'on_hold' } })
    expect(byId.total).toMatchObject({ kind: 'money', currency: 'EUR' })
    expect(byId.discountPercent).toMatchObject({ kind: 'percent', header: 'Discount', highlight: true })
    expect(byId.createdAt?.kind).toBe('datetime')
  })

  it("carries a field's suffix, value colours and badge shape to its column", () => {
    const area = { ...model, fields: { ...model.fields, area: field('area', 'integer') } } as ResourceModel
    const hinted = { ...view, fields: { area: { suffix: ' m²' }, status: { valueColors: { draft: '#cccccc' }, badgeShape: 'arrow' } }, list: { columns: ['area', 'status', 'total'] } } as unknown as ViewModel
    const [areaColumn, statusColumn, totalColumn] = columnsFromModel(area, hinted)
    expect(areaColumn).toMatchObject({ kind: 'number', suffix: ' m²' })
    expect(statusColumn).toMatchObject({ kind: 'status', colors: { draft: '#cccccc' }, shape: 'arrow' })
    expect(totalColumn).not.toHaveProperty('suffix')
    expect(byId.status).not.toHaveProperty('colors')
    expect(byId.status).not.toHaveProperty('shape')
  })

  it("gives a money column the view's decimals, and room for its suffix", () => {
    const rent = { ...model, fields: { ...model.fields, rent: field('rent', 'decimal') } } as ResourceModel
    const hinted = { ...view, fields: { ...view.fields, rent: { prefix: '€', decimals: 0, suffix: ' /month' } }, list: { columns: ['rent', 'total'] } } as unknown as ViewModel
    const [rentColumn, totalColumn] = columnsFromModel(rent, hinted)
    expect(rentColumn).toMatchObject({ kind: 'money', decimals: 0, suffix: ' /month' })
    expect(totalColumn).toMatchObject({ kind: 'money', decimals: 2 })
    expect(rentColumn!.minWidth).toBeGreaterThan(totalColumn!.width)
  })

  it('converts wire values for the cell renderers', () => {
    expect(byId.total?.value?.({ id: '1', total: '12.34' })).toBe(1234)
    expect(byId.discountPercent?.value?.({ id: '1', discountPercent: '5.00' })).toBe(5)
    expect(byId.createdAt?.value?.({ id: '1', createdAt: '2026-10-06T09:41:00.000Z' })).toBe(Date.UTC(2026, 9, 6, 9, 41))
  })
})
