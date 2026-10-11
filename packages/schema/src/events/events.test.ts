import { describe, expect, it } from 'vitest'
import { restrictModel } from '../access/restrict'
import { f } from '../fields'
import { resource } from '../resource'

const orders = resource('orders')
  .table('sales.orders')
  .fields({
    id: f.integer().readOnly(),
    status: f.enum(['open', 'paid', 'cancelled']),
    total: f.decimal({ precision: 12, scale: 2 }),
    notes: f.text().optional(),
    iban: f.text().optional().sensitive(),
    deletedAt: f.timestamp().optional(),
  })
  .primaryKey((r) => r.id)

describe('resource events', () => {
  it('crud gives created, updated and deleted, and undeleted with a soft delete field', () => {
    expect(orders.events((e) => e.crud()).toModel().events).toEqual([
      { name: 'orders.created', operations: ['create'] },
      { name: 'orders.updated', operations: ['update'] },
      { name: 'orders.deleted', operations: ['delete'] },
    ])
    const soft = orders.softDelete((r) => r.deletedAt).events((e) => e.crud())
    expect(soft.toModel().events!.map((event) => event.name)).toEqual(['orders.created', 'orders.updated', 'orders.deleted', 'orders.undeleted'])
  })

  it('keeps names, conditions and changed fields in the catalogue, and the code predicates out of it', () => {
    const match = ({ after }: { after?: { notes?: string | null } }) => String(after?.notes ?? '').includes('RUSH')
    const declared = orders.events((e, r) => [
      e.becomes('large', 'total > 1000'),
      e.updated('statusChanged', { changed: [r.status] }),
      e.updated('reopened', { from: 'status = "cancelled"', when: 'status != "cancelled"' }),
      e.created('rush', { match }),
    ])
    expect(declared.toModel().events).toEqual([
      { name: 'orders.large', operations: ['create', 'update'], becomes: 'total > 1000' },
      { name: 'orders.statusChanged', operations: ['update'], changed: ['status'] },
      { name: 'orders.reopened', operations: ['update'], when: 'status != "cancelled"', from: 'status = "cancelled"' },
      { name: 'orders.rush', operations: ['create'], match: true },
    ])
    expect(declared.eventMatches()).toEqual({ 'orders.rush': match })
    expect(JSON.parse(JSON.stringify(declared.toModel().events))).toEqual(declared.toModel().events)
  })

  it('lets changed name a sensitive field, which conditions cannot use', () => {
    expect(orders.events((e, r) => [e.updated('ibanChanged', { changed: [r.iban] })]).toModel().events).toEqual([
      { name: 'orders.ibanChanged', operations: ['update'], changed: ['iban'] },
    ])
    expect(() => orders.events((e) => [e.created('withIban', { when: 'iban:*' })]).toModel()).toThrow(
      'event "withIban" when uses sensitive field "iban", which events never hold; use `changed` instead',
    )
  })

  it('checks conditions against the model when the config loads', () => {
    expect(() => orders.events((e) => [e.becomes('large', 'totl > 1000')]).toModel()).toThrow('event "large" becomes Unknown field "totl"')
    expect(() => orders.events((e) => [e.updated('odd', { from: 'status = "lost"' })]).toModel()).toThrow('event "odd" from')
    expect(() => orders.search((r) => [r.notes]).events((e) => [e.created('found', { when: 'search("x")' })]).toModel()).toThrow('need the database')
    expect(() => orders.events((e) => [e.created('empty', { when: '' })]).toModel()).toThrow('event "empty" when is empty')
  })

  it('refuses duplicate and malformed names, unknown fields and undeleted without a soft delete', () => {
    expect(() => orders.events((e) => [...e.crud(), e.created()]).toModel()).toThrow('event "created" is declared twice')
    expect(() => orders.events((e) => [e.created('Big Order')]).toModel()).toThrow('event "Big Order" is not a camelCase name')
    expect(() => orders.events((e) => [e.undeleted()]).toModel()).toThrow('event "undeleted" needs a soft delete field')
    // @ts-expect-error unknown field
    expect(() => orders.events((e, r) => [e.updated('x', { changed: [r.nope] })])).toThrow('Unknown field "nope"')
  })

  it('has no catalogue without events, and none in a model restricted for a user', () => {
    expect(orders.toModel()).not.toHaveProperty('events')
    expect(orders.events(() => []).toModel()).not.toHaveProperty('events')
    const model = orders.events((e) => e.crud()).toModel()
    const access = { readableFields: Object.keys(model.fields), writableFields: { create: [], update: [] } }
    expect(restrictModel(model, access)).not.toHaveProperty('events')
  })
})
