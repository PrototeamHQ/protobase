import { describe, expect, it } from 'vitest'
import { sql } from 'kysely'
import { checkFilter, f, resource, where, type FieldModel, type ResourceModel } from '@protobase/schema'
import { compiled } from '../../../test-support/compile-sql'
import { columnRef } from './columns'
import { compileFilter } from './compile-filter'
import { lookupRead } from './linked-read'
import { withLookupRead } from './lookup-read'
import { uncoveredColumns } from './index-coverage'
import { lookupQueries } from './lookup-coverage'
import type { TableIndexes } from './table-indexes'

const customers = resource('customers').table('shop.customers')
  .fields({ id: f.integer(), tenant_id: f.integer(), name: f.text().filterable(), deleted_at: f.timestamp().optional() })
  .primaryKey((r) => r.id).tenant((r) => r.tenant_id).softDelete((r) => r.deleted_at).toModel()
const orders = resource('orders').table('orders')
  .fields({ id: f.integer(), customer_id: f.relation('customers').optional(), customer_name: f.text().lookup({ via: 'customer_id', field: 'name' }).filterable() })
  .primaryKey((r) => r.id).toModel()

const read = lookupRead({ model: customers, scope: { tenantValue: 7 }, value: customers.fields.name!, match: customers.fields.id!, link: orders.fields.customer_id! })
const customerName = withLookupRead(orders.lookups!.customer_name!, read)
const model: ResourceModel = { ...orders, fields: { ...orders.fields, customer_name: customerName } }
const text = (filter: Parameters<typeof checkFilter>[1]) => {
  const checked = checkFilter(model, filter)
  if (!checked.ok) throw new Error(checked.errors[0]!.message)
  return compiled(sql`${compileFilter(model, checked.filter)}`)
}

describe('a lookup field', () => {
  it("reads the linked field of the one linked record inside the caller's scope on it", () => {
    const { sql: query, parameters } = compiled(sql`${columnRef(customerName)}`)
    expect(query).toBe('(select l.v from (select "t"."id" as k, "t"."name" as v from "shop"."customers" as "t" where "t"."deleted_at" is null and "t"."tenant_id" = $1) as l where l.k = "t"."customer_id")')
    expect(parameters).toEqual([7])
  })

  it('is filtered by the keys of the linked records that hold the term, which indexes serve', () => {
    const { sql: query, parameters } = text(where.eq('customer_name', 'Ada'))
    expect(query).toBe('("t"."customer_id" is not null and "t"."customer_id" in (select "t"."id" from "shop"."customers" as "t" where "t"."deleted_at" is null and "t"."tenant_id" = $1 and "t"."name" = $2))')
    expect(parameters).toEqual([7, 'Ada'])
  })

  it('is empty without a linked record the caller reads whose field has a value', () => {
    expect(text(where.isNull('customer_name')).sql).toBe('not ("t"."customer_id" is not null and "t"."customer_id" in (select "t"."id" from "shop"."customers" as "t" where "t"."deleted_at" is null and "t"."tenant_id" = $1 and "t"."name" is not null))')
  })

  it('throws when read without the caller having been resolved for it', () => {
    expect(() => columnRef(orders.lookups!.customer_name as FieldModel)).toThrow('Lookup field "customer_name" is read without the caller\'s access to its linked record')
  })
})

describe('the indexes a read of a lookup field needs', () => {
  const btree = (...columns: string[]) => ({ name: columns.join('_'), method: 'btree', partial: false, keys: columns.map((column) => ({ column, definition: column, opclass: 'int4_ops' })) })
  const table = (...indexes: ReturnType<typeof btree>[]): TableIndexes => ({ kind: 'table', indexes })
  const filtered = checkFilter(model, where.eq('customer_name', 'Ada'))
  if (!filtered.ok) throw new Error('The test filter does not check')

  it('are its link on its own table', () => {
    expect(uncoveredColumns(model, table(btree('id')), { filter: filtered.filter })).toEqual([{ field: 'customer_id', column: 'customer_id', use: 'filter', need: 'btree', suggestion: 'create index on "orders" ("customer_id")' }])
    expect(uncoveredColumns(model, table(btree('id')), { sort: [['customer_name', 'asc']] })[0]).toMatchObject({ column: 'customer_id', use: 'sort' })
    expect(uncoveredColumns(model, table(btree('id'), btree('customer_id')), { filter: filtered.filter, sort: [['customer_name', 'asc']] })).toEqual([])
  })

  it('and its linked field on the linked table, in the scope it is read in', () => {
    const [term, sort] = lookupQueries(model, { filter: filtered.filter, sort: [['customer_name', 'desc']] })
    expect(term).toMatchObject({ field: 'customer_name', read, query: { filter: { kind: 'compare', field: customers.fields.name } } })
    expect(sort).toMatchObject({ field: 'customer_name', query: { sort: [['name', 'desc']] } })
    expect(uncoveredColumns(customers, table(btree('id')), term!.query, read.scope)[0]).toMatchObject({ column: 'name', use: 'filter', suggestion: 'create index on "shop"."customers" ("name")' })
    expect(uncoveredColumns(customers, table(btree('tenant_id', 'name')), term!.query, read.scope)).toEqual([])
  })
})
