import { describe, expect, it } from 'vitest'
import { acmeClient, acmeConnections } from './testing/connection-auth'
import { resolveConnections } from './declared-connections'

const google = { google: { clientId: 'google-client', clientSecret: 'google-secret' } }

describe('resolveConnections', () => {
  it("gives each connection its provider, client and revocation URL: the sign-in provider's client for one through it", () => {
    const [own, signIn] = resolveConnections(acmeConnections('https://acme.test'), { 'acme:account': acmeClient }, google, false)
    expect(own).toMatchObject({ key: 'acme:account', providerId: 'workflow-acme-account', client: acmeClient, revocationUrl: 'https://acme.test/revoke' })
    expect(signIn).toMatchObject({ key: 'acme:google', providerId: 'google', client: { clientId: 'google-client' } })
  })

  it('refuses a provider by its address unless private addresses are allowed, and a client of no such connection', () => {
    for (const origin of ['http://127.0.0.1:4000', 'https://169.254.169.254', 'http://localhost:4000']) {
      expect(() => resolveConnections(acmeConnections(origin), {}, google, false)).toThrow('names a host by its address')
      expect(() => resolveConnections(acmeConnections(origin), {}, google, true)).not.toThrow()
    }
    expect(() => resolveConnections(acmeConnections('https://acme.test'), { 'acme:google': acmeClient }, google, false)).toThrow('"acme:google" is no workflow plugin\'s connection')
    expect(() => resolveConnections(acmeConnections('https://acme.test'), { 'acme:account': { clientId: '', clientSecret: '' } }, google, false)).toThrow('needs its clientId and clientSecret')
  })
})
