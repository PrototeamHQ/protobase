import { describe, expect, it } from 'vitest'
import { f, resource, type RelatedModel } from '@protobase/schema'
import { listHandOrder, relatedHandOrder } from './hand-order'

const items = resource('items')
  .table('items')
  .fields({ id: f.integer(), invoice_id: f.relation('invoices').filterable(), position: f.integer().sortable(), shown: f.boolean().filterable() })
  .primaryKey((r) => r.id)
const all = { create: true, read: true, update: true, delete: true, conditional: [] }
const related = (o: Partial<RelatedModel> = {}): RelatedModel => ({ kind: 'related', title: 'Items', resource: 'items', field: 'invoice_id', ...o })

describe('sorting by hand', () => {
  it('sorts the whole list of a resource ordered as one, for a user who may update its position', () => {
    const model = items.position((r) => r.position).toModel()
    expect(listHandOrder(model, all)).toBe('position')
    expect(listHandOrder(model, { ...all, update: false })).toBeUndefined()
    expect(listHandOrder(model, { ...all, update: false, conditional: ['update'] })).toBe('position')
    expect(listHandOrder({ ...model, fields: { ...model.fields, position: { ...model.fields.position!, readOnly: true } } }, all)).toBeUndefined()
    expect(listHandOrder(items.toModel(), all)).toBeUndefined()
    expect(relatedHandOrder(related(), model, all)).toBeUndefined()
  })

  it("sorts a parent's records in its related section, when the section lists them all", () => {
    const model = items.position((r) => r.position, { within: (r) => r.invoice_id }).toModel()
    expect(listHandOrder(model, all)).toBeUndefined()
    expect(relatedHandOrder(related(), model, all)).toBe('position')
    expect(relatedHandOrder(related({ filter: 'shown = true' }), model, all)).toBeUndefined()
    expect(relatedHandOrder(related({ field: 'id', through: { resource: 'links', field: 'invoice_id' } }), model, all)).toBeUndefined()
    expect(relatedHandOrder(related({ from: 'invoice_id' }), model, all)).toBeUndefined()
    expect(relatedHandOrder(related(), model, { ...all, update: false })).toBeUndefined()
  })
})
