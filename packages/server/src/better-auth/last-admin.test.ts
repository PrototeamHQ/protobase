import { describe, expect, it } from 'vitest'
import { isActiveAdmin, takesAdminAway } from './last-admin'

const root = { id: 'root', role: 'admin', banned: false }
const other = { id: 'other', role: 'admin,sales', banned: null }
const plain = { id: 'plain', role: 'user', banned: false }

describe('isActiveAdmin', () => {
  it('holds the admin role, alone or with others, and is not blocked', () => {
    expect(isActiveAdmin(root)).toBe(true)
    expect(isActiveAdmin(other)).toBe(true)
    expect(isActiveAdmin({ ...root, banned: true })).toBe(false)
    expect(isActiveAdmin(plain)).toBe(false)
  })
})

describe('takesAdminAway', () => {
  it('is demoting, blocking or removing an active admin', () => {
    expect(takesAdminAway(root, { userId: 'root', roles: ['user'] })).toBe(true)
    expect(takesAdminAway(root, { userId: 'root', banned: true })).toBe(true)
    expect(takesAdminAway(root, { userId: 'root', removed: true })).toBe(true)
  })

  it('is not a change that keeps the admin role or unblocks', () => {
    expect(takesAdminAway(root, { userId: 'root', roles: ['admin', 'sales'] })).toBe(false)
    expect(takesAdminAway(root, { userId: 'root', banned: false })).toBe(false)
    expect(takesAdminAway(root, { userId: 'root' })).toBe(false)
  })

  it('is never a change to someone who is no active admin', () => {
    expect(takesAdminAway(plain, { userId: 'plain', removed: true })).toBe(false)
    expect(takesAdminAway({ ...root, banned: true }, { userId: 'root', roles: ['user'] })).toBe(false)
  })
})
