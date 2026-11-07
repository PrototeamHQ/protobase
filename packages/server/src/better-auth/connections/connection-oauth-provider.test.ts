import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AddressRefusedError } from '../../webhooks/table/pinned-request'
import { connectionOAuthProvider } from './connection-oauth-provider'
import { resolveConnections } from './declared-connections'
import { acmeClient, acmeConnections } from './testing/connection-auth'
import { fakeOAuthServer } from './testing/fake-oauth-server'

let fake: Awaited<ReturnType<typeof fakeOAuthServer>>
beforeEach(async () => (fake = await fakeOAuthServer()))
afterEach(() => fake.close())

const providerAt = (allowPrivateAddresses: boolean) => {
  const [connection] = resolveConnections(acmeConnections(fake.origin), { 'acme:account': acmeClient }, {}, true)
  if (!connection?.client || !('oauth' in connection.declaration)) throw new Error('acme:account has a client of its own')
  return connectionOAuthProvider({ ...connection, client: connection.client }, connection.declaration.oauth, { allowPrivateAddresses })
}

describe("a connection's own OAuth provider", () => {
  it("exchanges a code at the declared token URL and reads the account's id from its user URL", async () => {
    const provider = providerAt(true)
    const tokens = await provider.validateAuthorizationCode({ code: 'code-1', codeVerifier: 'verifier-1', redirectURI: 'https://admin.example.com/api/auth/callback/workflow-acme-account' })
    expect(tokens).toMatchObject({ accessToken: 'snapshot-access_token-1', refreshToken: 'snapshot-refresh_token-1' })
    expect(await provider.getUserInfo(tokens)).toMatchObject({ user: { id: '100000000000000000001', email: 'ada@example.com' } })
    expect(fake.callsTo('/userinfo')[0]!.authorization).toBe('Bearer snapshot-access_token-1')
  })

  it('reaches no private address unless the app allows it, so the code and client secret go nowhere', async () => {
    const provider = providerAt(false)
    await expect(provider.validateAuthorizationCode({ code: 'code-1', codeVerifier: 'verifier-1', redirectURI: 'https://admin.example.com/cb' })).rejects.toBeInstanceOf(AddressRefusedError)
    await expect(provider.refreshAccessToken('snapshot-refresh_token-1')).rejects.toBeInstanceOf(AddressRefusedError)
    expect(fake.calls).toEqual([])
  })
})
