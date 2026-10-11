import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { apiCors, readCorsOrigins } from './api-cors'

describe('readCorsOrigins', () => {
  it('reads `*`, or the origins of a comma-separated list', () => {
    expect(readCorsOrigins({ PROTOBASE_CORS_ORIGINS: ' * ' })).toBe('*')
    expect(readCorsOrigins({ PROTOBASE_CORS_ORIGINS: 'https://Shop.com/, https://app.example.com:8443' })).toEqual(['https://shop.com', 'https://app.example.com:8443'])
    expect(readCorsOrigins({ PROTOBASE_CORS_ORIGINS: '' })).toBeUndefined()
    expect(readCorsOrigins({})).toBeUndefined()
  })

  it('refuses what is not a URL', () => {
    expect(() => readCorsOrigins({ PROTOBASE_CORS_ORIGINS: 'shop.com' })).toThrow('"shop.com", which is not a URL')
  })
})

const own = 'https://admin.shop.com'
const app = (allowed: '*' | string[]) => {
  const hono = new Hono()
  hono.use('/api/*', apiCors({ own: ['https://erp-x1.protobase.net', own], allowed, skip: (path) => path.startsWith('/api/auth') }))
  hono.all('/api/*', (c) => c.json({ ok: true }, 201, { location: '/api/v1/orders/7' }))
  return hono
}
const from = (origin: string, init: RequestInit = {}) => ({ ...init, headers: { origin, ...init.headers } })
const preflight = (origin: string) => from(origin, { method: 'OPTIONS', headers: { 'access-control-request-method': 'PATCH', 'access-control-request-headers': 'authorization,if-match' } })

describe('apiCors', () => {
  it('allows the app\'s own origins and the listed ones, each by name and varying by origin', async () => {
    for (const origin of [own, 'https://shop.com']) {
      const response = await app(['https://shop.com']).request('/api/v1/orders', from(origin, { method: 'POST' }))
      expect(response.headers.get('access-control-allow-origin')).toBe(origin)
      expect(response.headers.get('vary')).toContain('Origin')
      expect(response.headers.get('access-control-expose-headers')).toContain('location')
      expect(response.headers.get('access-control-allow-credentials')).toBeNull()
    }
  })

  it('gives other origins no CORS headers', async () => {
    const response = await app(['https://shop.com']).request('/api/v1/orders', from('https://evil.example.com'))
    expect(response.status).toBe(201)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('allows every origin with `*`', async () => {
    expect((await app('*').request('/api/v1/orders', from('https://anywhere.example.com'))).headers.get('access-control-allow-origin')).toBe('*')
  })

  it('answers preflights with the headers the API takes, for ten minutes', async () => {
    const response = await app([]).request('/api/v1/orders/7', preflight(own))
    expect(response.status).toBe(204)
    expect(Object.fromEntries(response.headers)).toMatchObject({
      'access-control-allow-origin': own,
      'access-control-allow-headers': 'authorization,content-type,if-match,if-none-match',
      'access-control-allow-methods': 'GET,HEAD,POST,PUT,PATCH,DELETE',
      'access-control-max-age': '600',
    })
  })

  it('leaves the paths it skips alone', async () => {
    const response = await app('*').request('/api/auth/token', from(own))
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    expect((await app('*').request('/api/auth/token', preflight(own))).status).toBe(201)
  })
})
