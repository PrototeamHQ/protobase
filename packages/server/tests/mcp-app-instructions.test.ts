import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mcpInstructions } from '../src/mcp/mcp-instructions'
import { mcpStores, serveMcp, type McpStores } from './support/mcp-app'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

let stores: McpStores
beforeAll(async () => { stores = await mcpStores() })
afterAll(async () => { await stores.fixture.db.destroy() })

describe('an app\'s own MCP instructions', () => {
  it('reach a client after the framework\'s when it connects', async () => {
    const app = await serveMcp(stores, { admin: { mcp: { instructions: 'Plan a big ask before building it.' } } })
    const { tokens } = await app.grant('ana@example.com')
    const response = await app.request('/api/mcp', {
      body: { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'client', version: '1.0.0' } } },
      headers: { host: 'localhost:5173', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-11-25', authorization: `Bearer ${tokens.access_token}` },
    })
    const text = await response.text()
    const data = text.trimStart().startsWith('{') ? text : text.split('\n').find((line) => line.startsWith('data: '))!.slice('data: '.length)
    expect((JSON.parse(data) as { result: { instructions: string } }).result.instructions).toBe(`${mcpInstructions}\nPlan a big ask before building it.`)
  })

  it('stop startup when they take the server\'s past 4,096 characters', async () => {
    await expect(serveMcp(stores, { admin: { mcp: { instructions: 'a'.repeat(2692) } } })).rejects.toThrow('mcpEndpoint.instructions is 2692 characters')
  })
})
