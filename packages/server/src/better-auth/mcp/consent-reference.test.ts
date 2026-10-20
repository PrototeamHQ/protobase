import { describe, expect, it } from 'vitest'
import { fakeContext } from '../testing/fake-adapter'
import { consentReference } from './consent-reference'

const { context } = fakeContext()

describe('the grant a consent is made for', () => {
  it("is the session's active role when it switched", async () => {
    expect(await consentReference(context, { user: { id: 'ana', role: 'admin,sales', lastRole: 'admin' }, session: { activeRole: 'sales' } })).toBe('role=sales')
  })

  it('is the role chosen last without one on the session', async () => {
    expect(await consentReference(context, { user: { id: 'ana', role: 'admin,sales', lastRole: 'sales' }, session: {} })).toBe('role=sales')
  })

  it('is the first role held without either', async () => {
    expect(await consentReference(context, { user: { id: 'ana', role: 'admin,sales' }, session: { activeRole: null } })).toBe('role=admin')
  })

  it('holds the organization and the membership role, with organizations', async () => {
    const organizations = fakeContext({ member: [{ id: 'm1', organizationId: 'acme', userId: 'bo', role: 'member', appRoles: ['sales'] }] }, ['organization'])
    expect(await consentReference(organizations.context, { user: { id: 'bo', role: 'user' }, session: { activeOrganizationId: 'acme' } })).toBe('organization=acme&role=sales')
  })

  it('holds no role for someone without one', async () => {
    expect(await consentReference(context, { user: { id: 'cy', role: '' }, session: {} })).toBe('')
  })
})
