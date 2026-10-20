import { describe, expect, it } from 'vitest'
import { fakeAdapter } from './testing/fake-adapter'
import { tokenClaims } from './token-claims'

const ana = { id: 'ana', email: 'ana@example.com', role: 'admin,sales' }

describe('the claims of a token', () => {
  it('carry the address and the first wanted role held, without organizations', async () => {
    expect(await tokenClaims(ana, { wanted: ['sales'] })).toEqual({ email: 'ana@example.com', role: 'sales' })
    expect(await tokenClaims(ana, { wanted: [null, 'accountant'] })).toEqual({ email: 'ana@example.com', role: 'admin' })
  })

  it("carry the organization and the member's role there, with organizations", async () => {
    const { adapter } = fakeAdapter({
      member: [{ id: 'm1', organizationId: 'acme', userId: 'bo', role: 'member', appRoles: ['sales', 'accountant'] }],
      organization: [{ id: 'acme' }, { id: 'other' }],
    })
    const bo = { id: 'bo', email: 'bo@example.com', role: 'user' }
    expect(await tokenClaims(bo, { wanted: ['accountant'], organizationId: 'acme', organizations: adapter })).toEqual({
      email: 'bo@example.com',
      role: 'user',
      org: 'acme',
      org_role: 'member',
      app_roles: ['accountant'],
    })
    // Not a member, and no global role to enter it with.
    expect(await tokenClaims(bo, { wanted: [], organizationId: 'other', organizations: adapter })).toEqual({ email: 'bo@example.com', role: 'user' })
  })
})
