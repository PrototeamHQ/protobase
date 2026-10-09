import { resolveAccess } from '@protobase/schema'
import { describe, expect, it } from 'vitest'
import { arrears, leases, payments, tenants, tickets } from './index'

const as = (role: string) => ({ user: { id: 6, roles: [role] } })

describe('real estate roles', () => {
  // role, read, create, update, delete
  it.each([
    ['admin', true, true, true, true],
    ['manager', true, true, true, false],
    ['finance', true, false, false, false],
    ['maintenance', false, false, false, false],
  ] as const)('leases as %s', async (role, read, create, update, remove) => {
    const access = await resolveAccess(leases, as(role))
    expect(access.operations).toEqual({ list: read, read, create, update, delete: remove })
  })

  it.each([
    ['admin', true, true, true, true],
    ['manager', true, false, false, false],
    ['finance', true, true, true, true],
    ['maintenance', false, false, false, false],
  ] as const)('payments as %s', async (role, read, create, update, remove) => {
    const access = await resolveAccess(payments, as(role))
    expect(access.operations).toEqual({ list: read, read, create, update, delete: remove })
  })

  it.each(['admin', 'manager', 'finance', 'maintenance'])('arrears are read-only for %s', async (role) => {
    const access = await resolveAccess(arrears, as(role))
    expect(access.operations).toMatchObject({ create: false, update: false, delete: false, read: role !== 'maintenance' })
  })

  it('lets maintenance change only the tickets assigned to them', async () => {
    const access = await resolveAccess(tickets, as('maintenance'))
    expect(access.operations).toMatchObject({ read: true, create: true, update: true, delete: false })
    expect(access.rowFilter.read).toBeUndefined()
    expect(access.rowFilter.update).toMatchObject({ kind: 'compare', field: { name: 'assignedTo' }, value: { value: 6 } })
  })

  it.each([
    ['admin', true], ['manager', true], ['finance', true], ['maintenance', false],
  ] as const)("shows a tenant's income and IBAN to %s: %s", async (role, visible) => {
    const access = await resolveAccess(tenants, as(role))
    expect(access.readableFields).toContain('phone')
    expect(access.readableFields.includes('monthlyIncome')).toBe(visible)
    expect(access.readableFields.includes('iban')).toBe(visible)
  })
})
