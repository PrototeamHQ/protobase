import { describe, expect, it } from 'vitest'
import { authRequestOrganization } from './auth-request-organization'

const at = (path: string, init: { body?: unknown } = {}) =>
  new Request(`http://localhost/api/auth${path}`, {
    method: init.body === undefined ? 'GET' : 'POST',
    ...(init.body !== undefined && { headers: { 'content-type': 'application/json' }, body: JSON.stringify(init.body) }),
  })

const active = async () => 'acme'

describe('authRequestOrganization', () => {
  it("reads across organizations for the endpoints that list or find what is a user's own in any of them, saying why", async () => {
    expect(await authRequestOrganization(at('/organization/list'), active)).toEqual({ unscoped: 'a user lists the organizations they are a member of' })
    expect(await authRequestOrganization(at('/organization/list-user-invitations'), active)).toHaveProperty('unscoped')
    expect(await authRequestOrganization(at('/organization/create', { body: { name: 'New' } }), active)).toHaveProperty('unscoped')
  })

  it('works in the organization a request names, in its query or its JSON body', async () => {
    expect(await authRequestOrganization(at('/organization/list-members?organizationId=other'), active)).toBe('other')
    expect(await authRequestOrganization(at('/organization/remove-member', { body: { organizationId: 'other', memberIdOrEmail: 'm1' } }), active)).toBe('other')
  })

  it("works in the session's active organization for another organization endpoint, and in none elsewhere", async () => {
    expect(await authRequestOrganization(at('/organization/get-full-organization'), active)).toBe('acme')
    expect(await authRequestOrganization(at('/organization/invite-member', { body: { email: 'cy@example.com' } }), active)).toBe('acme')
    const unread = async () => {
      throw new Error('the session is read for organization endpoints only')
    }
    expect(await authRequestOrganization(at('/get-session'), unread)).toBeUndefined()
    expect(await authRequestOrganization(at('/sign-in/email', { body: { email: 'ana@example.com' } }), unread)).toBeUndefined()
  })

  it('leaves a body that is no JSON to Better Auth', async () => {
    const request = new Request('http://localhost/api/auth/organization/leave', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' })
    expect(await authRequestOrganization(request, active)).toBe('acme')
  })
})
