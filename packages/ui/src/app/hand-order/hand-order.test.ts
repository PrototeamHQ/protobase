import { describe, expect, it } from 'vitest'
import { f, resource, type RelatedModel, type ViewModel } from '@protobase/schema'
import { dragsRank, listHandOrder, relatedHandOrder } from './hand-order'

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

describe('dragsRank', () => {
  const ranked = { resource: 'items', fields: {}, list: { columns: ['id'], drag: { rank: true } } } as unknown as ViewModel

  it('drags the rows of an unfiltered list in the order of its position, when its list turns it on', () => {
    expect(dragsRank(ranked, 'position', 'position asc', '')).toBe(true)
    expect(dragsRank(ranked, 'position', 'position', '')).toBe(true)
  })

  it('does not in another order, with a filter, without the position or when the list leaves it off', () => {
    expect(dragsRank(ranked, 'position', 'position desc', '')).toBe(false)
    expect(dragsRank(ranked, 'position', 'id asc', '')).toBe(false)
    expect(dragsRank(ranked, 'position', 'position asc', 'shown = true')).toBe(false)
    expect(dragsRank(ranked, undefined, 'position asc', '')).toBe(false)
    expect(dragsRank({ ...ranked, list: { columns: ['id'] } }, 'position', 'position asc', '')).toBe(false)
    expect(dragsRank(undefined, 'position', 'position asc', '')).toBe(false)
  })
})
