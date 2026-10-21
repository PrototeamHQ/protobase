import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { mcpRoutes } from './mcp-routes'

const app = new Hono()
mcpRoutes(app, { path: '/api/mcp', handler: async (request) => Response.json({ method: request.method }) })

describe('mcpRoutes', () => {
  it('answers a preflight from any origin with the headers it asks for', async () => {
    const response = await app.request('/api/mcp', { method: 'OPTIONS', headers: { origin: 'https://client.example', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization, mcp-protocol-version' } })
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('access-control-allow-headers')).toBe('authorization,mcp-protocol-version')
  })

  it('sends a request to the handler, exposing the challenge header', async () => {
    const response = await app.request('/api/mcp', { method: 'POST', headers: { origin: 'https://client.example' } })
    expect(await response.json()).toEqual({ method: 'POST' })
    expect(response.headers.get('access-control-expose-headers')).toContain('www-authenticate')
  })
})
