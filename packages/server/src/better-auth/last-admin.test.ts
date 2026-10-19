import { describe, expect, it } from 'vitest'
import { isActiveAdmin, wouldLeaveNoAdmin } from './last-admin'

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

describe('wouldLeaveNoAdmin', () => {
  const alone = [root, plain]

  it('refuses demoting, blocking or removing the only active admin', () => {
    expect(wouldLeaveNoAdmin(alone, { userId: 'root', roles: ['user'] })).toBe(true)
    expect(wouldLeaveNoAdmin(alone, { userId: 'root', banned: true })).toBe(true)
    expect(wouldLeaveNoAdmin(alone, { userId: 'root', removed: true })).toBe(true)
  })

  it('allows it while another active admin remains', () => {
    expect(wouldLeaveNoAdmin([root, other], { userId: 'root', roles: ['user'] })).toBe(false)
    expect(wouldLeaveNoAdmin([root, other], { userId: 'root', banned: true })).toBe(false)
    expect(wouldLeaveNoAdmin([root, other], { userId: 'root', removed: true })).toBe(false)
  })

  it('counts a blocked admin as no admin', () => {
    expect(wouldLeaveNoAdmin([root, { ...other, banned: true }], { userId: 'root', banned: true })).toBe(true)
  })

  it('allows a change that keeps the admin role or unblocks', () => {
    expect(wouldLeaveNoAdmin(alone, { userId: 'root', roles: ['admin', 'sales'] })).toBe(false)
    expect(wouldLeaveNoAdmin(alone, { userId: 'root', banned: false })).toBe(false)
    expect(wouldLeaveNoAdmin(alone, { userId: 'root' })).toBe(false)
  })

  it('leaves other users and unknown ids alone', () => {
    expect(wouldLeaveNoAdmin(alone, { userId: 'plain', removed: true })).toBe(false)
    expect(wouldLeaveNoAdmin(alone, { userId: 'missing', banned: true })).toBe(false)
  })
})
