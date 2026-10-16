import { describe, expect, it } from 'vitest'
import type { FieldModel, ResourceModel, ViewModel } from '@protobase/schema'
import { autoMapping, importableFields, matchFields, unmappedRequired } from './mapping'

const field = (name: string, type: string, extra: Partial<FieldModel> = {}) => ({ name, column: name, type, nullable: false, readOnly: false, filterable: false, sortable: false, aliases: [], ...extra }) as FieldModel
const customers = { name: 'customers', table: { name: 'customers' }, primaryKey: ['id'], fields: { id: field('id', 'integer', { readOnly: true, filterable: true }) } } as unknown as ResourceModel
const lines = { name: 'lines', table: { name: 'lines' }, primaryKey: ['order', 'no'], fields: {} } as unknown as ResourceModel
const model = {
  name: 'orders',
  table: { name: 'orders' },
  primaryKey: ['id'],
  tenant: 'org',
  fields: {
    id: field('id', 'integer', { readOnly: true, filterable: true }),
    org: field('org', 'integer'),
    number: field('number', 'text', { filterable: true }),
    customer: field('customer', 'relation', { relation: { resource: 'customers', columns: ['customer_id'] } }),
    line: field('line', 'relation', { relation: { resource: 'lines', columns: ['a', 'b'] } }),
    status: field('status', 'enum', { enumValues: ['open'], default: { value: 'open' } }),
    notes: field('notes', 'text', { nullable: true }),
    data: field('data', 'json', { nullable: true }),
    secret: field('secret', 'text', { filterable: true, sensitive: true }),
  },
} as unknown as ResourceModel
const view = { resource: 'orders', fields: { number: { label: 'Order no.' } } } as unknown as ViewModel
const resources = { orders: model, customers, lines }

describe('import mapping', () => {
  it('imports writable fields a cell can hold, and relations to records with a key of one field', () => {
    expect(importableFields(model, resources).map((entry) => entry.name)).toEqual(['number', 'customer', 'status', 'notes', 'secret'])
  })

  it('finds records by their key or a filterable field, never a sensitive one', () => {
    expect(matchFields(model).map((entry) => entry.name)).toEqual(['id', 'number'])
  })

  it('maps headers to fields by label or name, ignoring case and spacing, each field once', () => {
    const fields = importableFields(model, resources)
    expect(autoMapping(['ORDER NO.', 'Customer', 'notes', 'Notes', 'Colour', ''], fields, view)).toEqual([
      { column: 0, field: 'number' },
      { column: 1, field: 'customer' },
      { column: 2, field: 'notes' },
    ])
  })

  it('lists the fields a new record needs that no column fills', () => {
    const fields = importableFields(model, resources)
    expect(unmappedRequired('create', fields, [{ column: 0, field: 'number' }]).map((entry) => entry.name)).toEqual(['customer', 'secret'])
    expect(unmappedRequired('update', fields, [])).toEqual([])
  })
})
