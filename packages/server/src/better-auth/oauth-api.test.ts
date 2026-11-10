import { describe, expect, it } from 'vitest'
import { resolveMcp } from './mcp/mcp-plugins'
import { resolveOAuthApi } from './oauth-api'

const baseURL = 'https://app.example.com'
const mcp = resolveMcp(baseURL, true)

describe('resolveOAuthApi', () => {
  it("names the API by its origin's /api with oauth.api, and none without it", () => {
    expect(resolveOAuthApi(`${baseURL}/`, { api: true }, mcp)).toEqual({ resource: 'https://app.example.com/api' })
    expect(resolveOAuthApi(baseURL, undefined, mcp)).toBeUndefined()
    expect(resolveOAuthApi(baseURL, { api: false }, mcp)).toBeUndefined()
  })

  it('stops startup without the MCP provider, which issues the tokens', () => {
    expect(() => resolveOAuthApi(baseURL, { api: true }, undefined)).toThrow('auth.oauth.api needs auth.mcp')
  })

  it("stops startup when the resource would be the app's url or the MCP endpoint's", () => {
    expect(() => resolveOAuthApi(`${baseURL}/api/`, { api: true }, resolveMcp(`${baseURL}/api`, true))).toThrow("is the app's url")
    expect(() => resolveOAuthApi(baseURL, { api: true }, resolveMcp(baseURL, { path: '/api' }))).toThrow("is the MCP endpoint's")
  })
})
