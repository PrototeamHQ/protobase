import { describe, expect, it } from 'vitest'
import type { DbColumn, DbTable } from '../db/model'
import { planScaffold } from './plan'
import { acceptAll } from './prompt'
import { parseTarget } from './targets'

const column = (name: string, typeName: string): DbColumn => ({ name, position: 1, typeName, formatted: typeName, isEnum: false, enumValues: [], notNull: true, identity: false, identityAlways: false, generated: false })

const orders: DbTable = {
  schema: 'shop',
  name: 'orders',
  kind: 'table',
  columns: [column('id', 'int4'), column('total', 'numeric')],
  foreignKeys: [],
  checks: [],
  indexes: [{ name: 'orders_pkey', columns: ['id'], unique: true, primary: true, partial: false, method: 'btree', opclasses: ['int4_ops'] }],
}

const orderLines: DbTable = {
  ...orders,
  name: 'order_lines',
  columns: [column('id', 'int4'), column('order_id', 'int4')],
  foreignKeys: [{ columns: ['order_id'], refSchema: 'shop', refTable: 'orders', refColumns: ['id'] }],
  indexes: [{ ...orders.indexes[0]!, name: 'order_lines_pkey' }],
}

const orderTotals: DbTable = { ...orders, name: 'order_totals', kind: 'view', indexes: [] }

const plan = (tables: DbTable[], excludes: string[] = []) =>
  planScaffold({ tables, existing: [], configDir: '/app/config', target: parseTarget(undefined), excludes, decide: acceptAll, ui: [], readText: async () => undefined })

describe('planScaffold', () => {
  it('names each view it skips, as it writes resources over tables only', async () => {
    const { changes, warnings } = await plan([orders, orderTotals])
    expect(warnings).toEqual(['shop.order_totals: a view, skipped; scaffold writes resources over tables, declare one over a view by hand'])
    expect(changes.map((change) => change.path)).toEqual(['/app/config/orders/data.ts', '/app/config/index.ts'])
  })

  it('says nothing of a view it was told to leave out', async () => {
    expect((await plan([orders, orderTotals], ['shop.order_totals'])).warnings).toEqual([])
  })

  it('writes an excluded table the written ones point to, and names it', async () => {
    const { changes, referenced } = await plan([orders, orderLines], ['shop.orders'])
    expect(referenced).toEqual([{ table: 'shop.orders', by: ['shop.order_lines'] }])
    expect(changes.map((change) => change.path)).toEqual(['/app/config/orders/data.ts', '/app/config/order_lines/data.ts', '/app/config/index.ts'])
  })

  it('leaves out an excluded table nothing written points to', async () => {
    const { changes, referenced } = await plan([orders, orderLines], ['shop.order_lines'])
    expect(referenced).toEqual([])
    expect(changes.map((change) => change.path)).toEqual(['/app/config/orders/data.ts', '/app/config/index.ts'])
  })
})
