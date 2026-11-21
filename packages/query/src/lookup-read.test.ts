import { describe, expect, it } from 'vitest'
import { sql } from 'kysely'
import { checkFilter, f, resource, where, type FieldModel, type ResourceModel } from '@protobase/schema'
import { compiled } from '../../../test-support/compile-sql'
import { columnRef } from './columns'
import { compileFilter } from './compile-filter'
import { lookupRead } from './linked-read'
import { lookupReadOf, withLookupRead } from './lookup-read'
import { lookupLink } from '@protobase/schema/internal'
import { uncoveredColumns } from './index-coverage'
import { lookupQueries, uncoveredLookupMatch } from './lookup-coverage'
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

describe('a lookup field of the one record pointing at each record', () => {
  const runtimes = resource('runtimes').table('runtimes')
    .fields({ id: f.integer(), app_id: f.relation('apps').columns(['app_fk']).optional(), release: f.text() })
    .primaryKey((r) => r.id).toModel()
  const apps = resource('apps').table('apps')
    .fields({ id: f.integer(), release: f.text().lookup({ from: 'runtimes', via: 'app_id', field: 'release' }).filterable() })
    .primaryKey((r) => r.id).toModel()
  const link = lookupLink(apps, apps.lookups!.release!, (name) => (name === 'runtimes' ? runtimes : undefined))!
  const release = withLookupRead(apps.lookups!.release!, lookupRead({ model: runtimes, scope: {}, value: link.value, match: link.match, link: link.link }))
  const appModel: ResourceModel = { ...apps, fields: { ...apps.fields, release } }
  const btree = (...columns: string[]) => ({ name: columns.join('_'), method: 'btree', partial: false, keys: columns.map((column) => ({ column, definition: column, opclass: 'int4_ops' })) })

  it("matches by the relation's own column and leaves null keys out, so empty holds without one", () => {
    const empty = checkFilter(appModel, where.isNull('release'))
    if (!empty.ok) throw new Error('The test filter does not check')
    expect(compiled(sql`${compileFilter(appModel, empty.filter)}`).sql).toBe('not "t"."id" in (select "t"."app_fk" from "runtimes" as "t" where "t"."app_fk" is not null and "t"."release" is not null)')
    expect(lookupQueries(appModel, { filter: empty.filter })[0]!.query.filter).toMatchObject({ kind: 'not', arg: { kind: 'isNull', field: { name: 'release' } } })
  })

  it('needs an index on that column of the linked table to show it', () => {
    expect(uncoveredLookupMatch(lookupReadOf(release)!, { kind: 'table', indexes: [btree('id')] })).toMatchObject([{ column: 'app_fk', use: 'lookup', suggestion: 'create index on "runtimes" ("app_fk")' }])
    expect(uncoveredLookupMatch(lookupReadOf(release)!, { kind: 'table', indexes: [btree('app_fk')] })).toEqual([])
  })

  it('finds the first rows per value by the linked field, which is no sort', () => {
    expect(lookupQueries(appModel, { per: 'release' })[0]!.query).toEqual({ groupBy: 'release' })
  })
})
