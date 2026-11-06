import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveConnections } from './declared-connections'
import { sealedRevoker, sealToken } from './sealed-revocation'
import { acmeClient, acmeConnections } from './testing/connection-auth'
import { fakeOAuthServer } from './testing/fake-oauth-server'

const secret = 'test-secret-test-secret-test-secret-1234'
const provider = 'workflow-acme-account'
let fake: Awaited<ReturnType<typeof fakeOAuthServer>>
beforeEach(async () => (fake = await fakeOAuthServer()))
afterEach(async () => await fake.close())

const revoker = () => sealedRevoker(resolveConnections(acmeConnections(fake.origin), { 'acme:account': acmeClient }, {}, true), async () => secret, true)

describe('a sealed revocation tried again', () => {
  it('sends the token it decrypts to the connection's revocation URL, as the provider answers', async () => {
    const token = await sealToken(secret, 'refresh-1')
    expect(token).not.toContain('refresh-1')
    fake.answers['/revoke'] = 'revoke-error'
    expect(await revoker()({ provider, hint: 'refresh_token', token })).toBe('refused')
    fake.answers['/revoke'] = 'revoke-ok'
    expect(await revoker()({ provider, hint: 'refresh_token', token })).toBe('revoked')
    expect(fake.callsTo('/revoke').map(({ form }) => form)).toEqual([0, 1].map(() => expect.objectContaining({ token: 'refresh-1', token_type_hint: 'refresh_token', client_id: acmeClient.clientId })))
  })

  it('is unreadable without calling the provider once the token no longer decrypts, or no connection revokes its provider', async () => {
    const otherSecret = await sealToken('another-secret-another-secret-another-1', 'refresh-1')
    expect(await revoker()({ provider, hint: 'refresh_token', token: otherSecret })).toBe('unreadable')
    expect(await revoker()({ provider, hint: 'refresh_token', token: 'not-a-sealed-token' })).toBe('unreadable')
    expect(await revoker()({ provider: 'workflow-gone-account', hint: 'refresh_token', token: await sealToken(secret, 'refresh-1') })).toBe('unreadable')
    expect(fake.callsTo('/revoke')).toEqual([])
  })
})
