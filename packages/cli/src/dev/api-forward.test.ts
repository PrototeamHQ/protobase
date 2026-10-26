import { describe, expect, it } from 'vitest'
import { isApiRequest } from './api-forward'

describe('isApiRequest', () => {
  it('takes the API, the passkey origins, the OAuth discovery documents and the push worker', () => {
    const api = [
      '/api',
      '/api?x=1',
      '/api/v1/orders',
      '/api/sb/rest/v1/orders',
      '/.well-known/webauthn',
      '/.well-known/oauth-authorization-server',
      '/.well-known/oauth-protected-resource/api/mcp',
      '/protobase.sw.js',
      '/protobase.sw.js?v=2',
    ]
    for (const url of api) expect(isApiRequest(url)).toBe(true)
  })

  it('leaves the app and its files to Vite', () => {
    const app = ['/', '/orders/7', '/apis', '/src/main.tsx', '/@vite/client', '/protobase.theme.css', '/.well-known/webauthnx', '/.well-known/openid-configuration', '/protobase.sw.json']
    for (const url of app) expect(isApiRequest(url)).toBe(false)
  })
})
