import { describe, expect, it } from 'vitest'
import { isAdmin } from '../auth/user-to-shell'
import { actingUser } from './acting-user'

const root = { id: 'u1', email: 'root@example.com', name: 'Root', role: 'admin,sales' }

describe('the user as the session acts', () => {
  it('has the active role alone, so an admin acting as sales is no admin', () => {
    const sales = actingUser(root, { active: 'sales', roles: [{ name: 'admin', label: 'Admin' }, { name: 'sales', label: 'Sales' }] })
    expect(sales.role).toBe('sales')
    expect(isAdmin(sales)).toBe(false)
  })

  it('is the signed-in user until the active role is read, and for someone without a role', () => {
    expect(actingUser(root, undefined)).toBe(root)
    expect(actingUser(root, { active: null, roles: [] })).toBe(root)
  })
})
