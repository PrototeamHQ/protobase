import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { bundleChanges } from './bundle-changes'

describe('bundleChanges', () => {
  it("maps each resource to its table and its key, tenant and owner columns, by column name", () => {
    const orders = resource('orders').table('orders').fields({ id: f.integer(), org: f.integer().column('organization_id'), placedBy: f.text() }).primaryKey((r) => r.id).tenant((r) => r.org).owner((r) => r.placedBy)
    const lines = resource('order_lines').table('sales.lines').fields({ order_id: f.integer(), line: f.integer() }).primaryKey((r) => [r.order_id, r.line])
    expect(bundleChanges([orders.toModel(), lines.toModel()])).toEqual({
      resources: {
        orders: { table: { schema: null, name: 'orders' }, key: ['id'], tenant: 'organization_id', personal: ['placed_by'] },
        order_lines: { table: { schema: 'sales', name: 'lines' }, key: ['order_id', 'line'], tenant: null, personal: [] },
      },
    })
  })
})
