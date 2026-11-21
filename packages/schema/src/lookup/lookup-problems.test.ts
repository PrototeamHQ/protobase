import { describe, expect, it } from 'vitest'
import type { AnyField } from '../field'
import { f } from '../fields'
import { resource } from '../resource'
import { restrictModel } from '../access/restrict'
import { resolveAccess } from '../access/resolve'
import { withLookups } from './with-lookups'

const orders = (fields: Record<string, AnyField>) =>
  resource('orders')
    .table('orders')
    .fields({ id: f.integer().readOnly(), customer_id: f.relation('customers'), ...fields })
    .primaryKey((r) => r.id)

describe('lookup fields', () => {
  it('are kept apart from the columns, read-only and optional', () => {
    const model = orders({ customer_name: f.text().lookup({ via: 'customer_id', field: 'name' }).filterable() }).toModel()
    expect(model.fields).not.toHaveProperty('customer_name')
    expect(model.lookups!.customer_name).toMatchObject({ type: 'text', readOnly: true, nullable: true, filterable: true, lookup: { via: 'customer_id', field: 'name' } })
    expect(withLookups(model).fields.customer_name).toBe(model.lookups!.customer_name)
    expect(orders({}).toModel()).not.toHaveProperty('lookups')
  })

  it('go through a relation of their own resource unless another resource points at it', () => {
    expect(() => orders({ name: f.text().lookup({ via: 'missing', field: 'name' }) }).toModel()).toThrow('lookup field "name" goes through "missing", which is not a relation of orders')
    expect(() => orders({ name: f.text().lookup({ via: 'id', field: 'name' }) }).toModel()).toThrow('goes through "id", which is not a relation of orders')
    expect(orders({ shipment: f.text().lookup({ from: 'shipments', via: 'order_id', field: 'carrier' }) }).toModel().lookups!.shipment!.lookup).toEqual({ from: 'shipments', via: 'order_id', field: 'carrier' })
  })

  it('refuse what reads or writes a column of their own', () => {
    expect(() => orders({ name: f.text().column('customer_name').lookup({ via: 'customer_id', field: 'name' }) }).toModel()).toThrow('cannot have a column()')
    expect(() => orders({ name: f.text().default('x').lookup({ via: 'customer_id', field: 'name' }) }).toModel()).toThrow('cannot have a default')
    expect(() => orders({ name: f.text().sensitive().lookup({ via: 'customer_id', field: 'name' }) }).toModel()).toThrow('cannot be sensitive')
    expect(() => orders({ owner: f.relation('users').lookup({ via: 'customer_id', field: 'owner_id' }) }).toModel()).toThrow('is relation, which a lookup cannot show (not implemented)')
    const searched = resource('orders').table('orders')
      .fields({ id: f.integer(), customer_id: f.relation('customers'), name: f.text().lookup({ via: 'customer_id', field: 'name' }) })
      .primaryKey((r) => r.id)
      .search((r) => [r.name])
    expect(() => searched.toModel()).toThrow('lookup field "name" cannot be searched')
  })

  it('are read by the callers their own read rule lets, and restricted with the fields', async () => {
    const source = orders({
      customer_name: f.text().lookup({ via: 'customer_id', field: 'name' }),
      customer_email: f.text().lookup({ via: 'customer_id', field: 'email' }).access({ read: () => false }),
    })
    const access = await resolveAccess(source, { user: { id: 'u1', roles: [] } })
    expect(access.readableFields).toEqual(['id', 'customer_id', 'customer_name'])
    expect(access.writableFields.create).not.toContain('customer_name')
    expect(Object.keys(restrictModel(source.toModel(), access).lookups!)).toEqual(['customer_name'])
  })
})
