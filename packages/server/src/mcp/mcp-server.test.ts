import { createMcpHandler } from '@modelcontextprotocol/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolRecords } from '../assistant/records'
import { defineTool, type ToolContext } from '../assistant/tools'
import { writeRecordTools } from '../assistant/write-record-tools'
import { forbidden } from '../problem'
import { mcpServer, type McpServerInput } from './mcp-server'

// The SDK's fromJsonSchema, watched: each call compiles its schema into a cache the SDK never empties.
const { compiled } = vi.hoisted(() => ({ compiled: { calls: 0 } }))
vi.mock('@modelcontextprotocol/server', async (load) => {
  const actual = await load<typeof import('@modelcontextprotocol/server')>()
  return { ...actual, fromJsonSchema: (...args: Parameters<typeof actual.fromJsonSchema>) => (compiled.calls++, actual.fromJsonSchema(...args)) }
})

const context = { session: { user: { id: 1, roles: ['sales'] } } } as Omit<ToolContext, 'approve'>
const echo = defineTool({
  name: 'echo',
  description: 'Echoes its text.',
  parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  annotations: { readOnlyHint: true },
  run: async (args, toolContext) => `${String(args.text)} for ${toolContext.session.user.id}`,
})
const broken = defineTool({ name: 'broken', description: 'Fails.', parameters: { type: 'object', properties: {} }, run: () => Promise.reject(new Error('secret detail')) })
const stopped = Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' })
const slow = defineTool({ name: 'slow', description: 'Reads too much.', parameters: { type: 'object', properties: {} }, run: () => Promise.reject(stopped) })

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

type Served = Partial<Pick<McpServerInput, 'tools' | 'context' | 'rolesWithoutApproval'>>

const post = async (report: (error: unknown) => void, headers: Record<string, string>, method: string, params: object, served: Served = {}) => {
  const handler = createMcpHandler(() => mcpServer({ info: { name: 'App', version: '1.0.0' }, tools: [echo, broken, write, slow], context, report, ...served }), { legacy: 'stateless' })
  const response = await handler.fetch(new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { accept: 'application/json, text/event-stream', 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }))
  const text = await response.text()
  const data = text.startsWith('{') ? text : text.split('\n').find((line) => line.startsWith('data: '))!.slice(6)
  return JSON.parse(data).result
}

const call = (report: (error: unknown) => void, method: string, params: object, served?: Served) => post(report, { 'mcp-protocol-version': '2025-11-25' }, method, params, served)

// A 2026-07-28 tools/call, which carries the client's capabilities in its own envelope.
const modern = (params: { name: string; arguments: object; inputResponses?: object }, capabilities: object, served?: Served) =>
  post(() => {}, { 'mcp-protocol-version': '2026-07-28', 'mcp-method': 'tools/call', 'mcp-name': params.name }, 'tools/call', {
    ...params,
    _meta: {
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientCapabilities': capabilities,
      'io.modelcontextprotocol/clientInfo': { name: 'client', version: '1.0.0' },
    },
  }, served)

const cannotAsk = { content: [{ type: 'text', text: 'This client cannot ask you to approve a change, so nothing was written; use a client that supports MCP elicitation.' }], isError: true }

describe('mcpServer', () => {
  it('lists the tools with their schemas and hints', async () => {
    const { tools } = await call(() => {}, 'tools/list', {})
    expect(tools).toMatchObject([
      { name: 'echo', description: 'Echoes its text.', inputSchema: { type: 'object', required: ['text'] }, annotations: { readOnlyHint: true } },
      { name: 'broken' },
      { name: 'write' },
      { name: 'slow' },
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

  it('compiles each tool\'s schema once however many servers are built with it', () => {
    const tools = ['first', 'second'].map((name) => defineTool({ ...echo, name, parameters: { type: 'object', properties: { text: { type: 'string' } } } }))
    compiled.calls = 0
    for (let built = 0; built < 50; built++) mcpServer({ info: { name: 'App', version: '1.0.0' }, tools, context, report: () => {} })
    expect(compiled.calls).toBe(tools.length)
  })

  it('names the tool whose query the database stopped, and reports it', async () => {
    const report = vi.fn()
    const result = await call(report, 'tools/call', { name: 'slow', arguments: {} })
    expect(result).toEqual({
      content: [{ type: 'text', text: 'slow ran a query longer than its statement timeout, so the database stopped it. Ask for less, such as with a narrower filter or fewer fields.' }],
      isError: true,
    })
    expect(report).toHaveBeenCalledWith(stopped)
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

  describe('for a role named in rolesWithoutApproval', () => {
    const service = { session: { user: { id: 2, roles: ['sales', 'service'] } } } as Omit<ToolContext, 'approve'>
    const exempt = { context: service, rolesWithoutApproval: ['service'] }
    const elsewhere = { rolesWithoutApproval: ['service'] }
    beforeEach(() => written.mockClear())

    it('writes in the first round on the 2025 protocol, without asking', async () => {
      expect(await call(() => {}, 'tools/call', { name: 'write', arguments: {} }, exempt)).toEqual({ content: [{ type: 'text', text: 'written' }] })
      expect(written).toHaveBeenCalledTimes(1)
    })

    it('writes for a client without form elicitation, and never asks one that has it', async () => {
      expect(await modern({ name: 'write', arguments: {} }, {}, exempt)).toMatchObject({ content: [{ type: 'text', text: 'written' }] })
      const asking = await modern({ name: 'write', arguments: {} }, { elicitation: {} }, exempt)
      expect(asking).toMatchObject({ content: [{ type: 'text', text: 'written' }] })
      expect(asking).not.toHaveProperty('inputRequests')
      expect(written).toHaveBeenCalledTimes(2)
    })

    it('still asks a user without the role, and refuses them when their client cannot ask, whatever the call claims', async () => {
      expect(await modern({ name: 'write', arguments: {} }, { elicitation: {} }, elsewhere)).toMatchObject({ resultType: 'input_required' })
      const claims = { role: 'service', roles: ['service'], approved: true, _meta: { role: 'service' } }
      expect(await call(() => {}, 'tools/call', { name: 'write', arguments: claims, _meta: { role: 'service', roles: ['service'] } }, elsewhere)).toEqual(cannotAsk)
      expect(await modern({ name: 'write', arguments: claims }, {}, elsewhere)).toMatchObject(cannotAsk)
      expect(written).not.toHaveBeenCalled()
    })

    it('leaves nothing behind for a later call by a user without the role', async () => {
      expect(await call(() => {}, 'tools/call', { name: 'write', arguments: {} }, exempt)).toMatchObject({ content: [{ type: 'text', text: 'written' }] })
      expect(await call(() => {}, 'tools/call', { name: 'write', arguments: {} }, elsewhere)).toEqual(cannotAsk)
      expect(written).toHaveBeenCalledTimes(1)
    })

    it('asks everyone when no role is named', async () => {
      expect(await call(() => {}, 'tools/call', { name: 'write', arguments: {} }, { context: service })).toEqual(cannotAsk)
      expect(await call(() => {}, 'tools/call', { name: 'write', arguments: {} }, { context: service, rolesWithoutApproval: [] })).toEqual(cannotAsk)
      expect(written).not.toHaveBeenCalled()
    })

    it('writes only the listed resources, under the caller\'s access rules, as when approved', async () => {
      const create = vi.fn(async (resource: string) => {
        if (resource === 'notes') throw forbidden('access-denied', 'You may not create notes')
        return { record: { id: 7 }, etag: '"v1"' }
      })
      const records = { ...service, records: { create } as unknown as ToolRecords }
      const served = { tools: writeRecordTools({ resources: ['tasks', 'notes'] }), context: records, rolesWithoutApproval: ['service'] }
      const text = async (resource: string) => ((await call(() => {}, 'tools/call', { name: 'create_record', arguments: { resource, data: { title: 'x' } } }, served)).content as Array<{ text: string }>)[0]!.text
      expect(JSON.parse(await text('people'))).toEqual({ error: 'forbidden', message: 'Writes over MCP reach only tasks, notes, not people; nothing was written.' })
      expect(JSON.parse(await text('notes'))).toEqual({ error: 'access-denied', message: 'You may not create notes' })
      expect(JSON.parse(await text('tasks'))).toEqual({ record: { id: 7 }, etag: '"v1"' })
      expect(create.mock.calls.map(([resource]) => resource)).toEqual(['notes', 'tasks'])
    })
  })
})
