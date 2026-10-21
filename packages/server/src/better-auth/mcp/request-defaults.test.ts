import { describe, expect, it } from 'vitest'
import { refusedRegistrationField, withOfflineAccess, withResource } from './request-defaults'

const resource = 'https://admin.example.com/api/mcp'

describe('what MCP clients leave out', () => {
  it('gets the one resource when none is sent, and keeps one that is', () => {
    expect(withResource({ client_id: 'c' }, resource)).toEqual({ client_id: 'c', resource })
    expect(withResource({ client_id: 'c', resource: 'https://other.example.com' }, resource)).toEqual({ client_id: 'c', resource: 'https://other.example.com' })
  })

  it('gets offline_access added to its scope once', () => {
    expect(withOfflineAccess('mcp')).toBe('mcp offline_access')
    expect(withOfflineAccess('mcp offline_access')).toBe('mcp offline_access')
    expect(withOfflineAccess('offline_access  mcp')).toBe('offline_access  mcp')
    expect(withOfflineAccess('')).toBe('offline_access')
  })
})

describe('what a client may not register', () => {
  it('is back-channel logout and a key set to fetch', () => {
    expect(refusedRegistrationField({ redirect_uris: ['http://127.0.0.1/cb'], backchannel_logout_uri: 'https://x.example/logout' })).toBe('backchannel_logout_uri')
    expect(refusedRegistrationField({ backchannel_logout_session_required: false })).toBe('backchannel_logout_session_required')
    expect(refusedRegistrationField({ jwks_uri: 'https://x.example/jwks' })).toBe('jwks_uri')
  })

  it('is nothing else', () => {
    expect(refusedRegistrationField({ redirect_uris: ['http://127.0.0.1/cb'], client_name: 'Example Assistant' })).toBeUndefined()
    expect(refusedRegistrationField(undefined)).toBeUndefined()
  })
})
