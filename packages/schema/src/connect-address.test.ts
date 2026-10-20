import { describe, expect, it } from 'vitest'
import { connectPath, connectRoute, readConnectAddress } from './connect-address'

const signed = 'response_type=code&client_id=abc&scope=mcp+offline_access&exp=1790000000&sig=c2lnbmF0dXJl'

describe('the connect page address', () => {
  it('carries a signed request whole, both ways', () => {
    expect(connectPath(signed)).toBe(`${connectRoute}?${signed}`)
    expect(readConnectAddress(`?${signed}`)).toEqual({ oauthQuery: signed })
    expect(readConnectAddress(signed)).toEqual({ oauthQuery: signed })
  })

  it('holds no request without a signature', () => {
    expect(connectPath()).toBe(connectRoute)
    expect(readConnectAddress('')).toEqual({})
    expect(readConnectAddress('?client_id=abc&scope=mcp')).toEqual({})
  })
})
