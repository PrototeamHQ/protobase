import { describe, expect, it } from 'vitest'
import { activeRole } from './active-role'

describe('activeRole', () => {
  it('is the first role, or none without roles', () => {
    expect(activeRole({ user: { id: 1, roles: ['warehouse', 'sales'] } })).toBe('warehouse')
    expect(activeRole({ user: { id: 1, roles: [] } })).toBeUndefined()
  })
})
