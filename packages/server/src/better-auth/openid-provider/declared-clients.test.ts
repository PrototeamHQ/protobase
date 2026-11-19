import { describe, expect, it } from 'vitest'
import { parseAudiencePattern } from './audience-patterns'
import { isDeclaredClient, resolveDeclaredClients, type DeclaredClient } from './declared-clients'

const phone: DeclaredClient = { clientId: 'example-phone', name: 'Phone', redirectUris: ['com.example.phone:/signed-in'], type: 'public', exchange: true }

describe('resolveDeclaredClients', () => {
  it('takes public clients under the ids written in the config', () => {
    expect(resolveDeclaredClients([phone], [])).toEqual([phone])
  })

  it('refuses a client with a secret, naming where it is', () => {
    expect(() => resolveDeclaredClients([phone, { ...phone, clientId: 'web', type: 'confidential' as never }], [])).toThrow('auth.openIdProvider.clients[1]: type must be public: a declared client has no secret')
  })

  it('refuses an id declared twice, a missing redirect URI and an unknown field', () => {
    expect(() => resolveDeclaredClients([phone, phone], [])).toThrow('auth.openIdProvider.clients[1]: client id "example-phone" is declared twice')
    expect(() => resolveDeclaredClients([{ ...phone, redirectUris: [] }], [])).toThrow('auth.openIdProvider.clients[0]: redirectUris')
    expect(() => resolveDeclaredClients([{ ...phone, secret: 's' } as DeclaredClient], [])).toThrow('auth.openIdProvider.clients[0]')
  })

  it('refuses a redirect URI the provider would not send a browser to', () => {
    expect(() => resolveDeclaredClients([{ ...phone, redirectUris: ['http://phone.example.com/callback'] }], [])).toThrow('auth.openIdProvider.clients[0]: redirectUris.0')
    expect(() => resolveDeclaredClients([{ ...phone, redirectUris: ['https://phone.example.com/callback#done'] }], [])).toThrow('auth.openIdProvider.clients[0]: redirectUris.0')
    expect(resolveDeclaredClients([{ ...phone, redirectUris: ['http://127.0.0.1:8080/callback', 'https://phone.example.com/callback'] }], [])).toHaveLength(1)
  })

  it('refuses a redirect URI on a host the token exchange alone issues tokens for', () => {
    const audiences = [parseAudiencePattern('https://*.example.app')]
    expect(() => resolveDeclaredClients([{ ...phone, redirectUris: ['https://shop.example.app/callback'] }], audiences)).toThrow('redirect URI https://shop.example.app/callback is on a host of auth.openIdProvider.audiences')
  })
})

describe('isDeclaredClient', () => {
  it('knows a declared client by where its record comes from', () => {
    expect(isDeclaredClient({ clientDiscoveryId: 'app-config' })).toBe(true)
    expect(isDeclaredClient({ clientDiscoveryId: null })).toBe(false)
    expect(isDeclaredClient(null)).toBe(false)
  })
})
