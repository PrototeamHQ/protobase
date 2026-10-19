import { describe, expect, it } from 'vitest'
import { adminChange } from './last-admin-guard'

describe('adminChange', () => {
  it('reads the change of each guarded admin endpoint', () => {
    expect(adminChange('/admin/set-role', { userId: 'u', role: 'user' })).toEqual({ userId: 'u', roles: ['user'] })
    expect(adminChange('/admin/set-role', { userId: 'u', role: ['admin', 'sales'] })).toEqual({ userId: 'u', roles: ['admin', 'sales'] })
    expect(adminChange('/admin/ban-user', { userId: 'u' })).toEqual({ userId: 'u', banned: true })
    expect(adminChange('/admin/remove-user', { userId: 'u' })).toEqual({ userId: 'u', removed: true })
  })

  it('reads update-user from its data: the role, the block, both or neither', () => {
    expect(adminChange('/admin/update-user', { userId: 'u', data: { role: 'user' } })).toEqual({ userId: 'u', roles: ['user'] })
    expect(adminChange('/admin/update-user', { userId: 'u', data: { banned: true } })).toEqual({ userId: 'u', banned: true })
    expect(adminChange('/admin/update-user', { userId: 'u', data: { role: 'sales', banned: false } })).toEqual({ userId: 'u', roles: ['sales'], banned: false })
    expect(adminChange('/admin/update-user', { userId: 'u', data: {} })).toBeUndefined()
  })

  it('takes nothing from another path or a body without a user', () => {
    expect(adminChange('/admin/unban-user', { userId: 'u' })).toBeUndefined()
    expect(adminChange('/admin/set-role', {})).toBeUndefined()
  })
})
