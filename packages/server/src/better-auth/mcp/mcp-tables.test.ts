import { describe, expect, it } from 'vitest'
import type { AdminAuth } from '../create-auth'
import { dropMcpTables, leftoverMcpTables, mcpTableNames, withMcpTables } from './mcp-tables'

const all = ['oauth_client', 'oauth_resource', 'oauth_client_resource', 'oauth_refresh_token', 'oauth_access_token', 'oauth_consent', 'oauth_client_assertion']
const on = { mcp: { resource: 'https://app.example.com/api/mcp', path: '/api/mcp', scope: 'mcp' } } as Pick<AdminAuth, 'mcp'>
const off = { mcp: undefined } as Pick<AdminAuth, 'mcp'>
const plan = (...missing: string[]) => ({ toBeCreated: missing.map((table) => ({ table, fields: {}, order: 0 })) })

describe("MCP's tables", () => {
  it('are the seven of the OAuth provider', () => {
    expect([...mcpTableNames].sort()).toEqual([...all].sort())
  })

  it('are dropped in one statement, each only if it exists', () => {
    const drop = dropMcpTables()
    expect(drop.match(/^drop table if exists (.+);$/m)![1]!.split(', ').sort()).toEqual(all.map((table) => `"${table}"`).sort())
    expect(drop.match(/;/g)).toHaveLength(1)
  })

  it("are dropped in the store's schema, whose name must be a plain one", () => {
    expect(dropMcpTables('auth').match(/^drop table if exists (.+);$/m)![1]!.split(', ').sort()).toEqual(all.map((table) => `"auth"."${table}"`).sort())
    expect(() => dropMcpTables('auth"; drop table "user')).toThrow(/Invalid auth schema name/)
  })

  it('are left over only with MCP off, when the planner would not create them', () => {
    expect(leftoverMcpTables(on, plan())).toEqual([])
    expect(leftoverMcpTables(off, plan(...all))).toEqual([])
    expect(leftoverMcpTables(off, plan('user', ...all.filter((table) => table !== 'oauth_consent' && table !== 'oauth_refresh_token'))).sort()).toEqual(['oauth_consent', 'oauth_refresh_token'])
    expect([...leftoverMcpTables(off, plan())].sort()).toEqual([...all].sort())
  })

  it('are named to the planner only with MCP off, with no fields', () => {
    const options = { plugins: [{ id: 'admin' }] } as unknown as AdminAuth['options']
    expect(withMcpTables({ ...on, options })).toBe(options)
    const named = withMcpTables({ ...off, options })
    expect(named.plugins!.map(({ id }) => id)).toEqual(['admin', 'protobase-mcp-tables'])
    const { schema } = named.plugins![1] as { schema: Record<string, { modelName: string; fields: object }> }
    expect(Object.values(schema).map(({ modelName }) => modelName).sort()).toEqual([...all].sort())
    expect(Object.values(schema).every(({ fields }) => Object.keys(fields).length === 0)).toBe(true)
  })
})
