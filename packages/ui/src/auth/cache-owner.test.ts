import { describe, expect, it } from 'vitest'
import { cacheOwner } from './cache-owner'

describe('cacheOwner', () => {
  const user = { id: 'u1', email: 'ann@example.com', name: 'Ann' }

  it('differs between users, and between a user and a visitor', () => {
    expect(cacheOwner({ kind: 'signed-in', user })).toBe('u1')
    expect(cacheOwner({ kind: 'signed-in', user: { ...user, id: 'u2' } })).toBe('u2')
    expect(cacheOwner({ kind: 'visitor' })).toBe('visitor')
  })
})
