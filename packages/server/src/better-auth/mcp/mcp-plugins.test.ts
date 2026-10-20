import { describe, expect, it } from 'vitest'
import { resolveMcp } from './mcp-plugins'

describe('the MCP options', () => {
  it('default to /api/mcp and /-/connect on the origin of baseURL', () => {
    expect(resolveMcp('https://admin.example.com/', true)).toMatchObject({ path: '/api/mcp', connectPage: '/-/connect', resource: 'https://admin.example.com/api/mcp' })
  })

  it('take another path and connect page', () => {
    expect(resolveMcp('https://admin.example.com', { path: '/mcp', connectPage: '/connect' })).toMatchObject({ resource: 'https://admin.example.com/mcp', connectPage: '/connect' })
  })

  it('refuse a path that would make the resource the issuer', () => {
    for (const path of ['', '/', 'api/mcp']) expect(() => resolveMcp('https://admin.example.com', { path })).toThrow(/must be a path below the app's origin/)
  })

  it('refuse a connect page elsewhere', () => {
    expect(() => resolveMcp('https://admin.example.com', { connectPage: 'https://evil.example/connect' })).toThrow(/must be a path on the app's origin/)
  })
})
