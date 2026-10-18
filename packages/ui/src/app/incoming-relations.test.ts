import { describe, expect, it } from 'vitest'
import { f, l, resource, view } from '@protobase/schema'
import { appPath } from '@protobase/schema'
import { incomingAddress, incomingRelations } from './incoming-relations'

const companies = resource('companies').table('companies').fields({ id: f.integer(), organization_id: f.relation('companies').filterable(), name: f.text() }).primaryKey((r) => r.id).tenant((r) => r.organization_id)
const people = resource('people').table('people').fields({ id: f.integer(), company_id: f.relation('companies').filterable() }).primaryKey((r) => r.id)
const orders = resource('orders')
  .table('orders')
  .fields({ id: f.integer(), customer_id: f.relation('companies').filterable(), supplier_id: f.relation('companies').filterable(), note: f.text() })
  .primaryKey((r) => r.id)
const invoices = resource('invoices').table('invoices').fields({ id: f.integer(), company_id: f.relation('companies') }).primaryKey((r) => r.id)
const order_lines = resource('order_lines').table('order_lines').fields({ id: f.integer(), company_id: f.relation('companies').filterable() }).primaryKey((r) => r.id)

const models = [companies, people, orders, invoices, order_lines].map((each) => each.toModel())
const resources = Object.fromEntries(models.map((model) => [model.name, model]))
const views = {
  people: view<typeof people>('people').names({ singular: 'Person', plural: 'People' }).toModel(),
  orders: view<typeof orders>('orders').names({ singular: 'Order', plural: 'Orders' }).fields((r) => ({ customer_id: r.customer_id.label('Customer'), supplier_id: r.supplier_id.label('Supplier') })).toModel(),
}
const company = resources.companies!

describe('incomingRelations', () => {
  it('lists each filterable relation pointing here, by the plural name, told apart by label when a resource has two', () => {
    expect(incomingRelations(company, resources, views, []).map((relation) => relation.label)).toEqual(['People', 'Orders (Customer)', 'Orders (Supplier)', 'Order lines'])
  })

  it('leaves out an unfilterable relation, the tenant, the lines drawn on the page and what a related section lists', () => {
    const layout = [l.related('Contacts', { resource: 'people', field: 'company_id' })]
    const found = incomingRelations(company, resources, views, layout, resources.order_lines)
    expect(found.map((relation) => `${relation.resource}.${relation.field}`)).toEqual(['orders.customer_id', 'orders.supplier_id'])
  })

  it('leaves out a resource the user cannot see, which the meta does not hold', () => {
    const { people: _, ...visible } = resources
    expect(incomingRelations(company, visible, views, []).map((relation) => relation.resource)).not.toContain('people')
  })

  it("links to the list filtered on this record's key", () => {
    expect(appPath(incomingAddress({ resource: 'orders', field: 'customer_id', label: 'Orders' }, '7'))).toBe('/orders?filter=customer_id+%3D+%227%22')
  })
})
