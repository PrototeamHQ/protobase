import { describe, expect, it } from 'vitest'
import { f, resource, restrictModel, view, type ResourceModel } from '@protobase/schema'
import { checkViews } from './check-views'
import type { Registry } from './registry'
import { pruneView } from './view-access'

const products = resource('products')
  .table('products')
  .fields({
    id: f.integer().readOnly(),
    name: f.text(),
    notes: f.text().optional(),
    price: f.decimal({ precision: 10, scale: 2 }),
    status: f.enum(['draft', 'live']),
    active: f.boolean(),
    changedAt: f.timestamp(),
  })
  .primaryKey((r) => r.id)

const model = products.toModel()
const registry = { entries: [{ name: 'products', model }] } as unknown as Registry

const productsView = view<typeof products>('products')
  .list((r) => ({ columns: [r.name, r.price, r.status, r.active], editable: [r.price, r.status, r.active] }))
  .toModel()

const withEditable = (columns: string[], editable: string[]) => {
  const stale = structuredClone(productsView)
  stale.list = { columns, editable }
  return stale
}

// The model as a caller who can read `readable` and write `writable` gets it, as `/meta` does.
const restricted = (readable: string[], writable: string[]): ResourceModel => restrictModel(model, { readableFields: readable, writableFields: { create: writable, update: writable } })

describe('view(...).list editable', () => {
  it('keeps the editable fields in the list', () => {
    expect(productsView.list).toEqual({ columns: ['name', 'price', 'status', 'active'], editable: ['price', 'status', 'active'] })
  })

  it('throws when an editable field is not among the columns', () => {
    expect(() => view<typeof products>('products').list((r) => ({ columns: [r.name], editable: [r.price] }))).toThrow(`View "products": editable field "price" is not among the list's columns`)
  })
})

describe('checkViews with editable columns', () => {
  it('takes fields of one line the API may write', () => {
    expect(() => checkViews(registry, [productsView])).not.toThrow()
  })

  it('refuses a read-only field, one without an editor of one line, or one that is not a column', () => {
    expect(() => checkViews(registry, [withEditable(['id'], ['id'])])).toThrow('View "products": editable field "id": "id" is read-only')
    expect(() => checkViews(registry, [withEditable(['changedAt'], ['changedAt'])])).toThrow('View "products": editable field "changedAt": "changedAt" is a timestamp field, which is not edited in a cell')
    expect(() => checkViews(registry, [withEditable(['name'], ['price'])])).toThrow(`View "products": editable field "price": it is not among the list's columns`)
  })

  it('refuses text that runs over several lines', () => {
    const multiline = view<typeof products>('products')
      .fields((r) => ({ notes: r.notes.multiline() }))
      .list((r) => ({ columns: [r.notes], editable: [r.notes] }))
      .toModel()
    expect(() => checkViews(registry, [multiline])).toThrow('View "products": editable field "notes": "notes" runs over several lines, which a cell does not hold')
  })
})

describe('pruneView with editable columns', () => {
  const all = Object.keys(model.fields)

  it('keeps the fields the caller may write', () => {
    expect(pruneView(productsView, restricted(all, all), {}).list).toEqual(productsView.list)
  })

  it('leaves out the fields the caller may not write, or not read', () => {
    expect(pruneView(productsView, restricted(all, ['status']), {}).list).toEqual({ columns: ['name', 'price', 'status', 'active'], editable: ['status'] })
    expect(pruneView(productsView, restricted(all.filter((name) => name !== 'price'), all), {}).list).toEqual({ columns: ['name', 'status', 'active'], editable: ['status', 'active'] })
  })

  it('leaves out the editable columns of a caller who may write none of them', () => {
    expect(pruneView(productsView, restricted(all, []), {}).list).toEqual({ columns: ['name', 'price', 'status', 'active'] })
  })
})
