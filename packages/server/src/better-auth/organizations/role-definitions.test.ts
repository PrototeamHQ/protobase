import { describe, expect, it } from 'vitest'
import { membershipRoles, roleDefinitions } from './role-definitions'

describe('roleDefinitions', () => {
  it('reads names only as today: admin first, no labels needed without organizations', () => {
    expect(roleDefinitions()).toEqual({ names: ['admin', 'user'], labels: { admin: 'Superuser', user: 'No global role' }, grants: { admin: [], user: [] } })
    expect(roleDefinitions(['sales', 'admin', 'sales']).names).toEqual(['admin', 'sales'])
  })

  it('reads labels and grants, and adds user as the role of an account without a global one with organizations', () => {
    const roles = roleDefinitions({ manager: { label: 'Manager', grants: ['accountant'] }, accountant: 'Accountant' }, { organizations: true })
    expect(roles).toEqual({
      names: ['admin', 'manager', 'accountant', 'user'],
      labels: { admin: 'Superuser', manager: 'Manager', accountant: 'Accountant', user: 'No global role' },
      grants: { admin: [], manager: ['accountant'], accountant: [], user: [] },
    })
    expect(membershipRoles(roles)).toEqual(['manager', 'accountant'])
  })

  it('refuses bad names, grants of unknown roles, and with organizations unlabelled roles and organization role names', () => {
    expect(() => roleDefinitions(['Sales'])).toThrow('Invalid role "Sales"')
    expect(() => roleDefinitions({ manager: { label: 'Manager', grants: ['nobody'] } })).toThrow('Role "manager" grants "nobody"')
    expect(() => roleDefinitions(['sales'], { organizations: true })).toThrow('Role "sales" needs a label')
    expect(() => roleDefinitions({ owner: 'Owner' }, { organizations: true })).toThrow('Role "owner" names an organization role')
    expect(() => roleDefinitions({ member: 'Member' }, { organizations: true })).toThrow('Role "member" names an organization role')
  })
})
