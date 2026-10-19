import { describe, expect, it } from 'vitest'
import { roleDefinitions } from '../organizations/role-definitions'
import { roleLabels } from './role-labels'

describe('roleLabels', () => {
  it('lists every role with its label, whether a member can hold it and what it grants', () => {
    const definitions = roleDefinitions({ manager: { label: 'Manager', grants: ['sales'] }, sales: 'Sales' }, { organizations: true })
    expect(roleLabels(definitions)).toEqual([
      { name: 'admin', label: 'Superuser', membership: false, grants: [] },
      { name: 'manager', label: 'Manager', membership: true, grants: ['sales'] },
      { name: 'sales', label: 'Sales', membership: true, grants: [] },
      { name: 'user', label: 'No global role', membership: false, grants: [] },
    ])
  })

  it('labels `user` as an ordinary role without organizations', () => {
    expect(roleLabels(roleDefinitions(['admin', 'user'])).map((role) => [role.name, role.label])).toEqual([['admin', 'Superuser'], ['user', 'User']])
  })
})
