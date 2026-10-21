import { describe, expect, it } from 'vitest'
import type { Authenticator } from '../types'
import { mcpAuthenticator } from './mcp-authenticator'

const plain: Authenticator = async () => ({ user: { id: 1, roles: [] } })
const forMcp: Authenticator = async () => ({ user: { id: 2, roles: [] } })
const withAudiences = Object.assign(plain, { forAudience: (audience: string) => (audience === 'https://app.example/api/mcp' ? forMcp : plain) })
const mcp = { resource: 'https://app.example/api/mcp' }

describe('mcpAuthenticator', () => {
  it('is the authenticator for the endpoint\'s audience, and none with MCP off', () => {
    expect(mcpAuthenticator(withAudiences, mcp, undefined)).toBe(forMcp)
    expect(mcpAuthenticator(withAudiences, undefined, undefined)).toBeUndefined()
  })

  it('stops the server when options.mcp is set without MCP, or authenticate cannot verify its tokens', () => {
    expect(() => mcpAuthenticator(withAudiences, undefined, { sql: true })).toThrow('options.mcp needs createAuth({ mcp })')
    expect(() => mcpAuthenticator(async () => ({ user: { id: 1, roles: [] } }), mcp, undefined)).toThrow('MCP needs authenticate from betterAuthAuthenticator')
  })
})
