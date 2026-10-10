import { describe, expect, it } from 'vitest'
import { checkAppRoleChange, effectiveRoles, globalRoles, grantableRoles, parseAppRoles } from './app-roles'
import { roleDefinitions } from './role-definitions'

const definitions = roleDefinitions(
  {
    support: 'Support',
    manager: { label: 'Manager', grants: ['accountant', 'billing'] },
    billing: { label: 'Billing', grants: ['viewer'] },
    accountant: 'Accountant',
    developer: 'Developer',
    viewer: 'Viewer',
  },
  { organizations: true },
)

const change = (held: string[], before: string[], after: string[]) => checkAppRoleChange({ held, before, after, definitions })

describe('the roles of a request', () => {
  it('are the global roles without the placeholder, then the membership ones, each once', () => {
    expect(globalRoles('user')).toEqual([])
    expect(globalRoles(null)).toEqual([])
    expect(globalRoles('support,user')).toEqual(['support'])
    expect(effectiveRoles(['support'], ['developer', 'support'])).toEqual(['support', 'developer'])
    expect(parseAppRoles('["billing"]')).toEqual(['billing'])
    expect(parseAppRoles(['billing', 1])).toEqual(['billing'])
    expect(parseAppRoles(null)).toEqual([])
  })
})

describe('who may give an app role', () => {
  it('is someone holding it, in the organization or globally', () => {
    expect(change(['developer'], [], ['developer'])).toBeUndefined()
    expect(change(['support'], [], ['support'])).toBeUndefined()
    expect(change(['developer'], [], ['accountant'])).toMatchObject({ status: 'FORBIDDEN', code: 'APP_ROLE_NOT_GRANTABLE', message: expect.stringContaining('Accountant') })
  })

  it('is someone holding a role that grants it, without chaining grants', () => {
    expect(grantableRoles(['manager'], definitions)).toEqual(new Set(['manager', 'accountant', 'billing']))
    expect(change(['manager'], [], ['accountant', 'billing'])).toBeUndefined()
    // billing grants viewer, but a manager who gives billing does not hold it
    expect(change(['manager'], [], ['viewer'])).toMatchObject({ code: 'APP_ROLE_NOT_GRANTABLE' })
  })

  it('limits taking a role away the same way, and leaves roles that do not change alone', () => {
    expect(change(['developer'], ['accountant'], [])).toMatchObject({ code: 'APP_ROLE_NOT_GRANTABLE' })
    expect(change(['developer'], ['accountant'], ['accountant', 'developer'])).toBeUndefined()
  })

  it('lets a superuser give any role a member can hold', () => {
    expect(change(['admin'], [], ['accountant', 'viewer', 'support'])).toBeUndefined()
  })

  it('refuses roles a member cannot hold: unknown ones, the superuser and the placeholder', () => {
    for (const role of ['nobody', 'admin', 'user']) expect(change(['admin'], [], [role])).toMatchObject({ status: 'BAD_REQUEST', code: 'UNKNOWN_APP_ROLE' })
  })
})
