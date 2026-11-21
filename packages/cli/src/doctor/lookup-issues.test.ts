import { describe, expect, it } from 'vitest'
import type { TableIndexes } from '@protobase/query'
import { f, resource } from '@protobase/schema'
import type { DbTable } from '../db/model'
import { indexIssues } from './index-issues'
import { lookupIssues } from './lookup-issues'
import { lookupReadModels } from './lookup-models'
import { readShapes } from './read-shapes'
import { sortIssues } from './sort-issues'

const customers = resource('customers').table('customers')
  .fields({ id: f.integer().filterable().sortable(), name: f.text().filterable().sortable() })
  .primaryKey((r) => r.id).toModel()
const orders = resource('orders').table('orders')
  .fields({
    id: f.integer().filterable().sortable(),
    customer_id: f.relation('customers').optional(),
    customer_name: f.text().lookup({ via: 'customer_id', field: 'name' }).filterable().sortable(),
    customer_id_shown: f.integer().lookup({ via: 'customer_id', field: 'id' }),
  })
  .primaryKey((r) => r.id).toModel()
const apps = resource('apps').table('apps')
  .fields({ id: f.integer().filterable().sortable(), release: f.text().lookup({ from: 'app_runtimes', via: 'app_id', field: 'release' }) })
  .primaryKey((r) => r.id).toModel()
const runtimes = resource('app_runtimes').table('app_runtimes')
  .fields({ id: f.integer(), app_id: f.relation('apps'), release: f.text() })
  .primaryKey((r) => r.id).toModel()

const btree = (...columns: string[]) => ({ name: columns.join('_'), method: 'btree', partial: false, keys: columns.map((column) => ({ column, definition: column, opclass: 'int4_ops' })) })
const indexes = (...list: ReturnType<typeof btree>[]): TableIndexes => ({ kind: 'table', indexes: list })

describe('the reads of a lookup field', () => {
  const models = lookupReadModels([customers, orders])
  const shapes = readShapes({ models, views: [], pages: [] })

  it('need an index on its link in its own table', () => {
    const [issue] = indexIssues(models[1]!, indexes(btree('id')), shapes)
    expect(issue).toMatchObject({ resource: 'orders', suggestion: 'create index on "orders" ("customer_id");' })
    expect(issue!.message).toContain('GET /orders?filter=customer_name = … ("customer_name" is filterable)')
    expect(issue!.message).toContain('GET /orders?order_by=customer_name asc ("customer_name" is sortable)')
  })

  it('and on its linked field in the linked table, named as the read that needs it', () => {
    const [issue] = indexIssues(models[0]!, indexes(btree('id')), shapes)
    expect(issue).toMatchObject({ resource: 'customers', suggestion: 'create index on "customers" ("name");' })
    expect(issue!.message).toContain('GET /orders?filter=customer_name = … ("customer_name" is filterable, through the lookup field "customer_name")')
    expect(indexIssues(models[0]!, indexes(btree('id'), btree('name')), shapes)).toEqual([])
  })

  it('sort only by a lookup field marked sortable', () => {
    const sorted = readShapes({ models, views: [], pages: [] }).map((shape) => (shape.resource === 'orders' ? { ...shape, query: { sort: [['customer_id_shown', 'asc']] as [string, 'asc'][] } } : shape))
    expect(sortIssues(models[1]!, sorted)[0]!.message).toMatch(/^customer_id_shown: not sortable/)
  })
})

describe('a lookup field of the one record pointing at each record', () => {
  const table = (unique: boolean): DbTable => ({
    schema: 'public', name: 'app_runtimes', kind: 'table', columns: [], foreignKeys: [], checks: [],
    indexes: [{ name: 'pkey', columns: ['id'], unique: true, primary: true, partial: false, method: 'btree', opclasses: [] }, { name: 'app', columns: ['app_id'], unique, primary: false, partial: false, method: 'btree', opclasses: [] }],
  })

  it('needs a unique index on that relation', () => {
    expect(lookupIssues(apps, [apps, runtimes], [table(false)])).toEqual([{
      severity: 'error',
      resource: 'apps',
      message: 'release: looks up the one app_runtimes record whose "app_id" points at each record, but no unique index on public.app_runtimes (app_id) makes it one, so a read fails once a record has two',
      suggestion: 'ALTER TABLE public.app_runtimes ADD UNIQUE (app_id);',
    }])
    expect(lookupIssues(apps, [apps, runtimes], [table(true)])).toEqual([])
  })
})
