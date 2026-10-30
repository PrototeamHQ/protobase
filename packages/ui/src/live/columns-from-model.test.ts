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
    quantity: field('quantity', 'integer'),
    total: field('total', 'decimal'),
    discountPercent: field('discountPercent', 'decimal'),
    createdAt: field('createdAt', 'timestamp'),
  },
} as unknown as ResourceModel

const view = {
  resource: 'orders',
  fields: {
    number: { format: 'code' },
    total: { currency: 'EUR', decimals: 2 },
    discountPercent: { label: 'Discount', format: 'percent' },
    status: { valueLabels: { shipped: 'Sent out' }, valueColors: { shipped: 'violet', on_hold: '#cccccc' } },
    quantity: { format: 'signed' },
  },
  list: { columns: ['number', 'companyId', 'status', 'quantity', 'total', 'discountPercent', 'createdAt', 'missing'] },
} as unknown as ViewModel

describe('columnsFromModel', () => {
  const columns = columnsFromModel(model, view, ['discountPercent'])
  const byId = Object.fromEntries(columns.map((column) => [column.id, column]))

  it('follows the list and skips unknown fields', () => {
    expect(columns.map((column) => column.id)).toEqual(['number', 'companyId', 'status', 'quantity', 'total', 'discountPercent', 'createdAt'])
  })

  it('maps field types and view hints to column kinds', () => {
    expect(byId.number).toMatchObject({ kind: 'id', sortable: true })
    expect(byId.companyId).toMatchObject({ kind: 'relation', header: 'Company' })
    expect(byId.status).toMatchObject({ kind: 'status', labels: { draft: 'draft', shipped: 'Sent out', on_hold: 'on_hold' } })
    expect(byId.quantity).toMatchObject({ kind: 'signed' })
    expect(byId.total).toMatchObject({ kind: 'money', currency: 'EUR' })
    expect(byId.discountPercent).toMatchObject({ kind: 'percent', header: 'Discount', highlight: true })
    expect(byId.createdAt?.kind).toBe('datetime')
  })

  it('takes no kind from a field name: a code, a signed number and money come only from the view', () => {
    const bare = { resource: 'orders', fields: {}, list: { columns: ['number', 'quantity', 'total'] } } as unknown as ViewModel
    expect(columnsFromModel(model, bare).map((column) => column.kind)).toEqual(['text', 'number', 'number'])
  })

  it('gives each value the tone its view declares, filled when it declares a hex colour, and neutral otherwise', () => {
    expect(byId.status?.tones).toEqual({ draft: 'neutral', shipped: 'violet', on_hold: 'neutral' })
    expect(byId.status?.colors).toEqual({ shipped: 'violet', on_hold: '#cccccc' })
    const bare = columnsFromModel(model, { resource: 'orders', fields: {}, list: { columns: ['status'] } } as unknown as ViewModel)
    expect(bare[0]?.tones).toEqual({ draft: 'neutral', shipped: 'neutral', on_hold: 'neutral' })
  })

  it('shows a decimal as money in the currency its view names, and a prefix alone as a plain number', () => {
    const priced = { ...view, fields: { total: { currency: 'USD' }, discountPercent: { prefix: '€', decimals: 2 } }, list: { columns: ['total', 'discountPercent'] } } as unknown as ViewModel
    const [total, prefixed] = columnsFromModel(model, priced)
    expect(total).toMatchObject({ kind: 'money', currency: 'USD' })
    expect(prefixed).toMatchObject({ kind: 'number', prefix: '€' })
    expect(prefixed).not.toHaveProperty('currency')
  })

  it("links a text column of addresses, but not the title's, which links to the record", () => {
    const people = { ...model, fields: { name: field('name', 'text'), email: field('email', 'text'), phone: field('phone', 'text') } } as unknown as ResourceModel
    const hinted = { resource: 'orders', fields: { name: { format: 'url' }, email: { format: 'email' }, phone: { format: 'code' } }, list: { columns: ['name', 'email', 'phone'] } } as unknown as ViewModel
    expect(columnsFromModel(people, hinted).map((column) => column.link)).toEqual([undefined, 'email', undefined])
  })

  it("carries a field's suffix, value colours and badge shape to its column", () => {
    const area = { ...model, fields: { ...model.fields, area: field('area', 'integer') } } as ResourceModel
    const hinted = { ...view, fields: { area: { suffix: ' m²' }, status: { valueColors: { draft: '#cccccc' }, badgeShape: 'arrow' } }, list: { columns: ['area', 'status', 'total'] } } as unknown as ViewModel
    const [areaColumn, statusColumn, totalColumn] = columnsFromModel(area, hinted)
    expect(areaColumn).toMatchObject({ kind: 'number', suffix: ' m²' })
    expect(statusColumn).toMatchObject({ kind: 'status', colors: { draft: '#cccccc' }, shape: 'arrow' })
    expect(totalColumn).not.toHaveProperty('suffix')
    expect(byId.status).not.toHaveProperty('shape')
  })

  it("gives a money column the view's decimals, and room for its suffix", () => {
    const rent = { ...model, fields: { ...model.fields, rent: field('rent', 'decimal') } } as ResourceModel
    const hinted = { ...view, fields: { ...view.fields, rent: { currency: 'EUR', decimals: 0, suffix: ' /month' } }, list: { columns: ['rent', 'total'] } } as unknown as ViewModel
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

  it('marks the title column: the view\'s title, else the first text column of the list', () => {
    expect(columns.filter((column) => column.title).map((column) => column.id)).toEqual(['number'])
    const titled = columnsFromModel(model, { ...view, title: 'companyId' } as ViewModel)
    expect(titled.filter((column) => column.title).map((column) => column.id)).toEqual(['companyId'])
  })
})
