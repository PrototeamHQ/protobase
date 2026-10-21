import { describe, expect, it } from 'vitest'
import type { Session } from '../types'
import { sameCaller } from './same-caller'

const ann: Session = { user: { id: 'ann', roles: ['sales', 'admin'] }, tenant: 1, organization: { id: 1 } }

describe('sameCaller', () => {
  it('holds for the same user, tenant, organization and roles, in any order', () => {
    expect(sameCaller(ann, { ...ann })).toBe(true)
    expect(sameCaller(ann, { ...ann, user: { id: 'ann', roles: ['admin', 'sales'] } })).toBe(true)
  })

  it('fails for another user, tenant, organization or set of roles', () => {
    expect(sameCaller(ann, { ...ann, user: { id: 'bob', roles: ann.user.roles } })).toBe(false)
    expect(sameCaller(ann, { ...ann, tenant: 2 })).toBe(false)
    expect(sameCaller(ann, { ...ann, organization: { id: 2 } })).toBe(false)
    expect(sameCaller(ann, { user: ann.user })).toBe(false)
    expect(sameCaller(ann, { ...ann, user: { id: 'ann', roles: ['sales'] } })).toBe(false)
    expect(sameCaller(ann, { ...ann, user: { id: 'ann', roles: ['sales', 'admin', 'owner'] } })).toBe(false)
    expect(sameCaller(ann, { ...ann, user: { id: 'ann', roles: ['sales', 'sales'] } })).toBe(false)
  })
})
