import { createMcpHandler } from '@modelcontextprotocol/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineTool, type ToolContext } from '../assistant/tools'
import { mcpServer } from './mcp-server'

const context = { session: { user: { id: 1, roles: ['sales'] } } } as Omit<ToolContext, 'approve'>
const echo = defineTool({
  name: 'echo',
  description: 'Echoes its text.',
  parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  annotations: { readOnlyHint: true },
  run: async (args, toolContext) => `${String(args.text)} for ${toolContext.session.user.id}`,
})
const broken = defineTool({ name: 'broken', description: 'Fails.', parameters: { type: 'object', properties: {} }, run: () => Promise.reject(new Error('secret detail')) })

const written = vi.fn()
const write = defineTool({
  name: 'write',
  description: 'Writes once approved.',
  parameters: { type: 'object', properties: {} },
  run: async (_args, toolContext) => {
    const answer = await toolContext.approve({ title: 'Write it?', code: 'it', approveLabel: 'Write' })
    if (answer !== 'approved') return `not approved (${answer})`
    written()
    return 'written'
  },
})

const post = async (report: (error: unknown) => void, headers: Record<string, string>, method: string, params: object) => {
  const handler = createMcpHandler(() => mcpServer({ info: { name: 'App', version: '1.0.0' }, tools: [echo, broken, write], context, report }), { legacy: 'stateless' })
  const response = await handler.fetch(new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { accept: 'application/json, text/event-stream', 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }))
  const text = await response.text()
  const data = text.startsWith('{') ? text : text.split('\n').find((line) => line.startsWith('data: '))!.slice(6)
  return JSON.parse(data).result
}

const call = (report: (error: unknown) => void, method: string, params: object) => post(report, { 'mcp-protocol-version': '2025-11-25' }, method, params)

// A 2026-07-28 tools/call, which carries the client's capabilities in its own envelope.
const modern = (params: { name: string; arguments: object; inputResponses?: object }, capabilities: object) =>
  post(() => {}, { 'mcp-protocol-version': '2026-07-28', 'mcp-method': 'tools/call', 'mcp-name': params.name }, 'tools/call', {
    ...params,
    _meta: {
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientCapabilities': capabilities,
      'io.modelcontextprotocol/clientInfo': { name: 'client', version: '1.0.0' },
    },
  })

const cannotAsk = { content: [{ type: 'text', text: 'This client cannot ask you to approve a change, so nothing was written; use a client that supports MCP elicitation.' }], isError: true }

describe('mcpServer', () => {
  it('lists the tools with their schemas and hints', async () => {
    const { tools } = await call(() => {}, 'tools/list', {})
    expect(tools).toMatchObject([
      { name: 'echo', description: 'Echoes its text.', inputSchema: { type: 'object', required: ['text'] }, annotations: { readOnlyHint: true } },
      { name: 'broken' },
      { name: 'write' },
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

  describe('a tool that asks for approval', () => {
    beforeEach(() => written.mockClear())

    it('is refused on the 2025 protocol, which cannot ask', async () => {
      expect(await call(() => {}, 'tools/call', { name: 'write', arguments: {} })).toEqual(cannotAsk)
      expect(written).not.toHaveBeenCalled()
    })

    it('is refused for a client without form elicitation', async () => {
      expect(await modern({ name: 'write', arguments: {} }, {})).toMatchObject(cannotAsk)
      expect(written).not.toHaveBeenCalled()
    })

    it('asks a client with elicitation for the user\'s approval', async () => {
      expect(await modern({ name: 'write', arguments: {} }, { elicitation: {} })).toMatchObject({
        resultType: 'input_required',
        inputRequests: { approve: { method: 'elicitation/create', params: { mode: 'form', message: 'Write it?\n\nit', requestedSchema: { properties: { approve: { type: 'boolean', title: 'Write' } }, required: ['approve'] } } } },
      })
      expect(written).not.toHaveBeenCalled()
    })

    it('runs once with the user\'s approval', async () => {
      const result = await modern({ name: 'write', arguments: {}, inputResponses: { approve: { action: 'accept', content: { approve: true } } } }, { elicitation: {} })
      expect(result).toMatchObject({ content: [{ type: 'text', text: 'written' }] })
      expect(written).toHaveBeenCalledTimes(1)
    })

    it('writes nothing when the user declines', async () => {
      const result = await modern({ name: 'write', arguments: {}, inputResponses: { approve: { action: 'decline' } } }, { elicitation: {} })
      expect(result).toMatchObject({ content: [{ type: 'text', text: 'not approved (rejected)' }] })
      expect(written).not.toHaveBeenCalled()
    })
  })
})
