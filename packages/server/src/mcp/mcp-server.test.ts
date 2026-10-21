import { createMcpHandler } from '@modelcontextprotocol/server'
import { describe, expect, it, vi } from 'vitest'
import { defineTool, type ToolContext } from '../assistant/tools'
import { mcpServer } from './mcp-server'

const context = { session: { user: { id: 1, roles: ['sales'] } } } as ToolContext
const echo = defineTool({
  name: 'echo',
  description: 'Echoes its text.',
  parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  annotations: { readOnlyHint: true },
  run: async (args, toolContext) => `${String(args.text)} for ${toolContext.session.user.id}`,
})
const broken = defineTool({ name: 'broken', description: 'Fails.', parameters: { type: 'object', properties: {} }, run: () => Promise.reject(new Error('secret detail')) })

const call = async (report: (error: unknown) => void, method: string, params: object) => {
  const handler = createMcpHandler(() => mcpServer({ info: { name: 'App', version: '1.0.0' }, tools: [echo, broken], context, report }), { legacy: 'stateless' })
  const response = await handler.fetch(new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { accept: 'application/json, text/event-stream', 'content-type': 'application/json', 'mcp-protocol-version': '2025-11-25' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }))
  const text = await response.text()
  const data = text.startsWith('{') ? text : text.split('\n').find((line) => line.startsWith('data: '))!.slice(6)
  return JSON.parse(data).result
}

describe('mcpServer', () => {
  it('lists the tools with their schemas and hints', async () => {
    const { tools } = await call(() => {}, 'tools/list', {})
    expect(tools).toMatchObject([
      { name: 'echo', description: 'Echoes its text.', inputSchema: { type: 'object', required: ['text'] }, annotations: { readOnlyHint: true } },
      { name: 'broken' },
    ])
  })

  it('answers a call with the text the tool returns, run with the context', async () => {
    expect(await call(() => {}, 'tools/call', { name: 'echo', arguments: { text: 'hi' } })).toMatchObject({ content: [{ type: 'text', text: 'hi for 1' }] })
  })

  it('reports a tool that throws and answers a failure without its message', async () => {
    const report = vi.fn()
    const result = await call(report, 'tools/call', { name: 'broken', arguments: {} })
    expect(result).toEqual({ content: [{ type: 'text', text: 'The server failed to answer.' }], isError: true })
    expect(report).toHaveBeenCalledWith(new Error('secret detail'))
  })

  it('refuses a tool name a model endpoint would refuse', () => {
    expect(() => mcpServer({ info: { name: 'App', version: '1.0.0' }, tools: [{ ...echo, name: 'bad name' }], context, report: () => {} })).toThrow('must be 1 to 64')
  })
})
