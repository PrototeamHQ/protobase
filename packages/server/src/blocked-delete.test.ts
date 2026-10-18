import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { blockingRelation } from './blocked-delete'
import { buildRegistry } from './registry'

const companies = resource('companies').table('crm.companies').fields({ id: f.integer() }).primaryKey((r) => r.id)
const orders = resource('orders').table('crm.orders').fields({ id: f.integer(), company_id: f.relation('companies') }).primaryKey((r) => r.id)
const transfers = resource('transfers').table('transfers').fields({ id: f.integer(), from_id: f.relation('companies'), to_id: f.relation('companies') }).primaryKey((r) => r.id)
const sites = resource('sites').table('sites').fields({ a: f.integer(), b: f.integer() }).primaryKey((r) => [r.a, r.b])
const visits = resource('visits').table('visits').fields({ id: f.integer(), site: f.relation('sites').columns(['site_a', 'site_b']) }).primaryKey((r) => r.id)
const notes = resource('notes').table('notes').fields({ id: f.integer(), order_id: f.relation('orders') }).primaryKey((r) => r.id)

const registry = buildRegistry([companies, orders, transfers, sites, visits, notes])
const entry = (name: string) => registry.find(name)!

describe('blockingRelation', () => {
  it('finds the resource of the table and its relation to the deleted one', () => {
    expect(blockingRelation({ schema: 'crm', table: 'orders' }, entry('companies'), registry.entries)).toEqual({ entry: entry('orders'), field: 'company_id' })
  })

  it('finds nothing in another schema', () => {
    expect(blockingRelation({ schema: 'public', table: 'orders' }, entry('companies'), registry.entries)).toBeUndefined()
  })

  it('finds nothing for a table no resource reads', () => {
    expect(blockingRelation({ schema: 'public', table: 'invoices' }, entry('companies'), registry.entries)).toBeUndefined()
  })

  it('names no field when two point at the deleted resource', () => {
    expect(blockingRelation({ schema: 'public', table: 'transfers' }, entry('companies'), registry.entries)).toEqual({ entry: entry('transfers') })
  })

  it('names no field for a relation over several columns', () => {
    expect(blockingRelation({ schema: 'public', table: 'visits' }, entry('sites'), registry.entries)).toEqual({ entry: entry('visits') })
  })

  it('finds nothing when the table does not point at the deleted resource', () => {
    expect(blockingRelation({ schema: 'public', table: 'notes' }, entry('companies'), registry.entries)).toBeUndefined()
  })
})
