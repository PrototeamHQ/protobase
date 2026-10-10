import { describe, expect, it } from 'vitest'
import { initialOrganization } from './active-organization'

const memberships = [
  { organizationId: 'globex', createdAt: '2026-02-01T00:00:00Z' },
  { organizationId: 'acme', createdAt: '2026-01-01T00:00:00Z' },
]

describe('the organization a session starts in', () => {
  it('is the last one while the person is a member there', () => {
    expect(initialOrganization({ memberships, last: 'globex', entersAny: false, lastExists: true })).toBe('globex')
  })

  it('is the last one for someone with a global role while it exists, even without a membership', () => {
    expect(initialOrganization({ memberships: [], last: 'initech', entersAny: true, lastExists: true })).toBe('initech')
    expect(initialOrganization({ memberships, last: 'initech', entersAny: true, lastExists: false })).toBe('acme')
  })

  it('is the oldest membership otherwise, and none without one', () => {
    expect(initialOrganization({ memberships, last: 'initech', entersAny: false, lastExists: true })).toBe('acme')
    expect(initialOrganization({ memberships, entersAny: false, lastExists: false })).toBe('acme')
    expect(initialOrganization({ memberships: [], last: null, entersAny: false, lastExists: false })).toBeUndefined()
  })
})
