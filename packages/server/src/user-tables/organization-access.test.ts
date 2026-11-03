import { describe, expect, it } from 'vitest'
import { organizationAdmins, organizationAdminsOf } from './organization-access'

const member = (role?: 'owner' | 'admin' | 'member', roles: string[] = ['sales'], id: string | number = 'a') => ({ user: { id: 'u', roles }, organization: { id, ...(role && { role }) } })

describe('organizationAdmins', () => {
  it("lets an organization's owners and admins in, and superusers working in it", () => {
    expect(organizationAdmins(member('owner'))).toBe(true)
    expect(organizationAdmins(member('admin'))).toBe(true)
    expect(organizationAdmins(member(undefined, ['admin']))).toBe(true)
  })
  it('keeps out a plain member, someone the store names no role for, and anyone working in no organization, superusers too', () => {
    expect(organizationAdmins(member('member'))).toBe(false)
    expect(organizationAdmins(member())).toBe(false)
    expect(organizationAdmins({ user: { id: 'u', roles: ['admin'] } })).toBe(false)
    expect(organizationAdmins({ user: { id: 'u', roles: [] } })).toBe(false)
    expect(organizationAdmins({})).toBe(false)
  })
})

describe('organizationAdminsOf', () => {
  it('lets in only the admins of its own organization, comparing ids as text', () => {
    const ofA = organizationAdminsOf('a')
    expect(ofA(member('admin'))).toBe(true)
    expect(ofA(member('admin', ['sales'], 'b'))).toBe(false)
    expect(ofA(member('owner', ['admin'], 'b'))).toBe(false)
    expect(ofA(member('member'))).toBe(false)
    expect(organizationAdminsOf('7')(member('admin', [], 7))).toBe(true)
  })
})
