import { describe, expect, it } from 'vitest'
import type { CurrentOrganization, RoleLabel } from '@protobase/client'
import { grantableRoles, organizationMenuItems } from './organization-paths'

const roles: RoleLabel[] = [
  { name: 'admin', label: 'Superuser', membership: false, grants: [] },
  { name: 'manager', label: 'Manager', membership: true, grants: ['accountant'] },
  { name: 'sales', label: 'Sales', membership: true, grants: [] },
  { name: 'accountant', label: 'Accountant', membership: true, grants: [] },
  { name: 'user', label: 'No global role', membership: false, grants: [] },
]
const acme = { id: '1', name: 'Acme', slug: 'acme' }
const ids = (current?: CurrentOrganization) => organizationMenuItems('/admin', '/-/organization', current).map((item) => item.id)

describe('the organization menu items', () => {
  it('give everyone their organizations, members the current one, and owners and admins its people', () => {
    expect(ids(undefined)).toEqual(['organizations'])
    expect(ids({ organization: acme, role: 'member', appRoles: [], globalRoles: [] })).toEqual(['organizations', 'organization'])
    expect(ids({ organization: acme, role: 'admin', appRoles: [], globalRoles: [] })).toEqual(['organizations', 'organization', 'members', 'invitations'])
    expect(organizationMenuItems('/admin', '/-/organization', { organization: acme, globalRoles: [] })[1]).toMatchObject({ href: '/admin/-/organization', active: true })
  })
})

describe('the app roles someone may give', () => {
  it('are the held ones, globally or in the organization, and their grants; every one for a superuser', () => {
    expect(grantableRoles(roles, { organization: acme, role: 'admin', appRoles: ['sales'], globalRoles: [] })).toEqual(new Set(['sales']))
    expect(grantableRoles(roles, { organization: acme, role: 'admin', appRoles: [], globalRoles: ['manager'] })).toEqual(new Set(['manager', 'accountant']))
    expect(grantableRoles(roles, { organization: acme, globalRoles: ['admin'] })).toEqual(new Set(['manager', 'sales', 'accountant']))
  })
})
