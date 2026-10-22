import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { closedMcpRoutes, mcpRoutes } from './mcp-routes'

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

describe('closedMcpRoutes', () => {
  const methods = ['POST', 'GET', 'DELETE', 'OPTIONS', 'HEAD']
  const paths = ['/api/mcp', '/api/mcp/', '/api/mcp/x']

  it('answers 404 at the path and under it to every method, before the system endpoints\' token check', async () => {
    const closed = new Hono()
    closedMcpRoutes(closed, '/api/mcp')
    closed.use('/api/*', async (c) => c.text('unauthorized', 401))
    for (const method of methods)
      for (const path of paths)
        for (const headers of [{}, { authorization: 'Bearer x' }] as Array<Record<string, string>>) expect((await closed.request(path, { method, headers })).status, `${method} ${path}`).toBe(404)
    expect((await closed.request('/api/other')).status).toBe(401)
  })

  it('answers the 404 itself under a host whose own not-found page is a 200', async () => {
    const admin = new Hono()
    closedMcpRoutes(admin, '/mcp')
    const host = new Hono()
    host.notFound((c) => c.html('<p>the site</p>', 200))
    host.route('/', admin)
    for (const method of ['GET', 'POST', 'OPTIONS'])
      for (const path of ['/mcp', '/mcp/', '/mcp/x']) {
        const response = await host.request(path, { method, headers: { accept: 'text/html' } })
        expect(response.status, `${method} ${path}`).toBe(404)
        expect(response.headers.get('content-type')).not.toContain('html')
      }
  })
})
