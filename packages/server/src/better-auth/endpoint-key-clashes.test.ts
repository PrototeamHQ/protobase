import { createAuthEndpoint } from 'better-auth/api'
import { describe, expect, it } from 'vitest'
import { createAuth } from './create-auth'
import { assertNoEndpointKeyClashes, endpointKeyClashes } from './endpoint-key-clashes'

const endpoint = (path: string) => createAuthEndpoint(path, { method: 'GET' }, async (ctx) => ctx.json({}))

describe('endpointKeyClashes', () => {
  it('names each key more than one plugin registers, with those plugins', () => {
    const plugins = [
      { id: 'organization', endpoints: { listUserInvitations: endpoint('/organization/list-user-invitations'), getInvitation: endpoint('/organization/get-invitation') } },
      { id: 'protobase-users', endpoints: { listUserInvitations: endpoint('/users/invitations') } },
      { id: 'jwt' },
    ]
    expect(endpointKeyClashes(plugins)).toEqual([{ key: 'listUserInvitations', plugins: ['organization', 'protobase-users'] }])
    expect(() => assertNoEndpointKeyClashes(plugins)).toThrow('Auth plugins register the same endpoint keys, so one hides the other: listUserInvitations (organization, protobase-users)')
  })

  it('finds none when every key is a plugin of its own', () => {
    expect(() => assertNoEndpointKeyClashes([{ id: 'a', endpoints: { one: endpoint('/one') } }, { id: 'b', endpoints: { two: endpoint('/two') } }])).not.toThrow()
  })
})

describe('the auth plugins with every feature on', () => {
  it("register no endpoint key twice, so Better Auth's organization endpoints answer at their paths", () => {
    const auth = createAuth({
      database: undefined,
      baseURL: 'https://admin.example.com',
      secret: 'test-secret-test-secret-test-secret-1234',
      mailer: { send: async () => {} },
      operator: false,
      signInProvider: { issuer: 'https://idp.example.com', clientId: 'platform-client', clientSecret: 'platform-secret', provider: 'platform' },
      sso: { saml: [{ id: 'okta', domains: ['example.com'], idp: { metadata: '<EntityDescriptor/>' } }] },
      passwordHashes: ['bcrypt'],
      roles: { sales: 'Sales' },
      organizations: {},
      mcp: true,
    })
    expect(auth.api.listUserInvitations.path).toBe('/organization/list-user-invitations')
    expect(auth.api.getInvitation.path).toBe('/organization/get-invitation')
    expect(auth.api.listAppInvitations.path).toBe('/users/invitations')
    expect(auth.api.invitationOfLink.path).toBe('/invitation')
  })
})
