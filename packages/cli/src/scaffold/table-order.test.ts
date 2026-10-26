import { describe, expect, it } from 'vitest'
import type { DbTable } from '../db/model'
import { dependencyOrder } from './table-order'

const table = (name: string, ...refs: string[]) =>
  ({ schema: 'public', name, kind: 'table', columns: [], indexes: [], checks: [], foreignKeys: refs.map((ref) => ({ columns: [`${ref}_id`], refSchema: 'public', refTable: ref, refColumns: ['id'] })) }) as DbTable

describe('dependencyOrder', () => {
  it('puts each table after those its foreign keys point to, otherwise by name', () => {
    const tables = [table('order_items', 'orders', 'products'), table('orders', 'customers'), table('products'), table('customers'), table('audit')]
    expect(dependencyOrder(tables).map((each) => each.name)).toEqual(['audit', 'customers', 'orders', 'products', 'order_items'])
  })

  it('ends a cycle of foreign keys and ignores references to tables outside the set', () => {
    const tables = [table('vehicles', 'service_jobs', 'owners'), table('service_jobs', 'vehicles')]
    expect(dependencyOrder(tables).map((each) => each.name)).toEqual(['vehicles', 'service_jobs'])
  })
})
