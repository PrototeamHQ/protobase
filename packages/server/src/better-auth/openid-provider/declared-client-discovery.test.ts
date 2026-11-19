import { describe, expect, it } from 'vitest'
import { declaredClientRecord, recordChanged } from './declared-client-discovery'
import { tokenExchangeGrant } from './openid-provider-options'

const phone = { clientId: 'example-phone', name: 'Phone', redirectUris: ['com.example.phone:/signed-in'], type: 'public' as const }

describe('declaredClientRecord', () => {
  it('records a public client with PKCE and no consent under its declared id, with no operator mark', () => {
    const record = declaredClientRecord(phone)
    expect(record).toMatchObject({ clientId: 'example-phone', clientDiscoveryId: 'app-config', tokenEndpointAuthMethod: 'none', applicationType: 'native', grantTypes: ['authorization_code'], scopes: ['openid', 'email', 'profile'], skipConsent: true, requirePKCE: true })
    expect(record).not.toHaveProperty('metadata')
  })

  it('gives a client that may exchange refresh tokens and the exchange grant', () => {
    expect(declaredClientRecord({ ...phone, exchange: true })).toMatchObject({ grantTypes: ['authorization_code', 'refresh_token', tokenExchangeGrant], scopes: ['openid', 'email', 'profile', 'offline_access'] })
  })
})

describe('recordChanged', () => {
  it('compares only the fields the record sets', () => {
    const record = declaredClientRecord(phone)
    expect(recordChanged({ ...record, id: '1', createdAt: new Date() }, record)).toBe(false)
    expect(recordChanged({ ...record, redirectUris: ['com.example.other:/signed-in'] }, record)).toBe(true)
  })
})
