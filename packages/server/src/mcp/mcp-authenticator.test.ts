import { describe, expect, it, vi } from 'vitest'
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

  it('is none when the host serves its own endpoint, without asking for the audience\'s', () => {
    const forAudience = vi.fn(() => forMcp)
    expect(mcpAuthenticator(plain, mcp, false)).toBeUndefined()
    expect(mcpAuthenticator(Object.assign(async () => ({ user: { id: 1, roles: [] } }), { forAudience }), mcp, false)).toBeUndefined()
    expect(forAudience).not.toHaveBeenCalled()
    expect(mcpAuthenticator(plain, undefined, false)).toBeUndefined()
  })

  it('stops the server on any other value of options.mcp, with MCP on or off', () => {
    for (const options of ['false', 0, null, true, { enabled: false }, { sql: 'true' }, { writes: 'true' }, { writes: { resources: [] } }, { writes: { resources: 'tasks' } }, { writes: { resources: [''] } }, { writes: { resources: ['tasks'], creates: true } }, []]) {
      expect(() => mcpAuthenticator(withAudiences, mcp, options as never)).toThrow('options.mcp takes false or { sql?: boolean, writes?: boolean | { resources: [<resource>, ...] } }')
      expect(() => mcpAuthenticator(withAudiences, undefined, options as never)).toThrow('options.mcp takes false or { sql?: boolean, writes?: boolean | { resources: [<resource>, ...] } }')
    }
    expect(mcpAuthenticator(withAudiences, mcp, {})).toBe(forMcp)
    expect(mcpAuthenticator(withAudiences, mcp, { sql: false })).toBe(forMcp)
    expect(mcpAuthenticator(withAudiences, mcp, { sql: true, writes: true })).toBe(forMcp)
    expect(mcpAuthenticator(withAudiences, mcp, { writes: { resources: ['tasks'] } })).toBe(forMcp)
  })
})
