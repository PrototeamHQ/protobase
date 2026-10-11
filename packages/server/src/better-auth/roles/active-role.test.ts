import { describe, expect, it } from 'vitest'
import { narrowClaims, resolveActiveRole } from './active-role'

describe('the role a session acts with', () => {
  it('is the first wanted one the person holds: the session\'s, then the last chosen', () => {
    expect(resolveActiveRole(['admin', 'sales'], ['sales', 'admin'])).toBe('sales')
    expect(resolveActiveRole(['admin', 'sales'], ['accountant', 'admin'])).toBe('admin')
    expect(resolveActiveRole(['admin', 'sales'], [null, 'sales'])).toBe('sales')
  })

  it('is their first role without a held wanted one, and none without a role', () => {
    expect(resolveActiveRole(['sales', 'accountant'], [undefined, null])).toBe('sales')
    expect(resolveActiveRole(['sales', 'accountant'], ['manager'])).toBe('sales')
    expect(resolveActiveRole([], ['sales'])).toBeUndefined()
  })
})

describe('the role claims of a token', () => {
  it('carry the active role alone, without organizations', () => {
    expect(narrowClaims({ role: 'admin,sales' }, ['sales'], false)).toEqual({ role: 'sales' })
    expect(narrowClaims({ role: 'admin,sales' }, [], false)).toEqual({ role: 'admin' })
    expect(narrowClaims({ role: '{admin,sales}' }, [null, 'sales'], false)).toEqual({ role: 'sales' })
    expect(narrowClaims({ role: 'user' }, ['admin'], false)).toEqual({ role: 'user' })
  })

  it('move a membership role into app_roles and leave no global role, with organizations', () => {
    const claims = { role: 'support', org: 'acme', org_role: 'member', app_roles: ['sales', 'accountant'] }
    expect(narrowClaims(claims, ['accountant'], true)).toEqual({ ...claims, role: 'user', app_roles: ['accountant'] })
    expect(narrowClaims(claims, ['support'], true)).toEqual({ ...claims, role: 'support', app_roles: [] })
    expect(narrowClaims(claims, [], true)).toEqual({ ...claims, role: 'support', app_roles: [] })
    expect(narrowClaims({ ...claims, app_roles: ['support'] }, ['support'], true)).toEqual({ ...claims, role: 'support', app_roles: ['support'] })
  })

  it('keep a global role only outside an organization, and change nothing for someone without a role', () => {
    expect(narrowClaims({ role: 'admin,support' }, ['support'], true)).toEqual({ role: 'support' })
    expect(narrowClaims({ role: 'user', org: 'acme' }, ['sales'], true)).toEqual({ role: 'user', org: 'acme' })
  })
})
