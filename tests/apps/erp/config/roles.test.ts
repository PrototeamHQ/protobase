import { resolveAccess } from '@protobase/schema'
import { describe, expect, it } from 'vitest'
import { empMaster, notificationSettings, orders, stockMoves } from './index'

const as = (role: string) => ({ user: { id: 3, roles: [role] } })

describe('ERP roles on orders', () => {
  const rows = [
    // role, read, create, update, delete, read filter, update filter
    ['admin', true, true, true, true, undefined, undefined],
    ['auditor', true, false, false, false, undefined, undefined],
    ['manager', true, true, true, false, undefined, undefined],
    ['sales', true, true, true, false, 'compare', 'compare'],
    ['accountant', true, false, false, false, undefined, undefined],
    ['warehouse', true, false, true, false, undefined, undefined],
    ['editor', false, false, false, false, undefined, undefined],
    ['integration', true, true, false, false, undefined, undefined],
  ] as const

  it.each(rows)('%s', async (role, read, create, update, remove, readFilter, updateFilter) => {
    const access = await resolveAccess(orders, as(role))
    expect(access.operations).toEqual({ list: read, read, create, update, delete: remove })
    expect(access.rowFilter.read?.kind).toBe(readFilter)
    expect(access.rowFilter.update?.kind).toBe(updateFilter)
    if (readFilter) expect(access.rowFilter.read).toMatchObject({ field: { name: 'owner_id' }, value: { value: 3 } })
    expect(access.readableFields.length > 0).toBe(read)
  })
})

describe('hidden columns', () => {
  // accountant holds costs.read but has no access to stock_moves at all
  const unitCost = [
    ['admin', true], ['auditor', true], ['manager', true], ['accountant', false],
    ['sales', false], ['warehouse', false], ['editor', false], ['integration', false],
  ] as const

  it.each(unitCost)('stock_moves.unit_cost for %s: %s', async (role, visible) => {
    const access = await resolveAccess(stockMoves, as(role))
    expect(access.readableFields.includes('unit_cost')).toBe(visible)
    if (role === 'warehouse') expect(access.readableFields).toContain('quantity')
  })

  it.each(['admin', 'auditor', 'manager', 'accountant', 'sales', 'warehouse', 'editor', 'integration'])(
    'emp_master.sal_amt for %s is admin only',
    async (role) => {
      const access = await resolveAccess(empMaster, as(role))
      expect(access.readableFields.includes('sal_amt')).toBe(role === 'admin')
      if (role === 'manager') expect(access.readableFields).toContain('emp_name')
    },
  )

  it('a field with only a read rule follows its resource for writes', async () => {
    const access = await resolveAccess(stockMoves, as('warehouse'))
    expect(access.writableFields.create).toContain('unit_cost')
  })
})

describe('ERP roles on notification settings', () => {
  // Owned by the Better Auth id, which is text.
  const person = (role: string) => ({ user: { id: '3', roles: [role] } })

  // The account page's Settings keeps everyone to their own record, admins too; these are who has settings at all.
  it.each(['admin', 'auditor', 'manager', 'sales', 'accountant', 'warehouse', 'editor'])('%s reads and writes their own', async (role) => {
    const access = await resolveAccess(notificationSettings, person(role))
    expect(access.operations).toMatchObject({ read: true, create: true, update: true })
  })

  it('leaves the integration role, which is no person, without any', async () => {
    const access = await resolveAccess(notificationSettings, person('integration'))
    expect(access.operations).toMatchObject({ read: false, create: false, update: false })
  })
})
