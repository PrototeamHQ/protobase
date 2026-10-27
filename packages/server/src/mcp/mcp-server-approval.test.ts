import { createMcpHandler } from '@modelcontextprotocol/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { batchWriteTool } from '../assistant/batch-write-tool'
import type { ToolRecords } from '../assistant/records'
import { defineTool, type AssistantTool } from '../assistant/tools'
import { writeRecordTools } from '../assistant/write-record-tools'
import { requestLocale } from '../locale/request-locale'
import { forbidden } from '../problem'
import type { Session } from '../types'
import { approvalLifetime, mcpApprovals, type McpApprovals } from './mcp-approval-store'
import { mcpServer } from './mcp-server'

const resource = new URL('http://localhost/api/mcp')
const ann: Session = { user: { id: 1, roles: ['sales'] }, client: { id: 'client', scopes: ['mcp'] } }

const records = {
  get: vi.fn(async () => ({ record: { id: 1, title: 'old' }, etag: '"v1"' })),
  create: vi.fn(async () => ({ record: { id: 1 }, etag: '"v1"' })),
  update: vi.fn(async () => ({ record: { id: 1 }, etag: '"v2"' })),
  delete: vi.fn(async () => undefined),
  batch: vi.fn(async () => []),
  softDeleteField: vi.fn(async () => undefined),
}
const writes = () => records.create.mock.calls.length + records.update.mock.calls.length + records.delete.mock.calls.length + records.batch.mock.calls.length
const report = vi.fn()

type Caller = { session?: Session; resource?: URL; approvals?: McpApprovals; tools?: AssistantTool[]; acceptLanguage?: string }
type Round = { requestState?: unknown; inputResponses?: object }

let approvals: McpApprovals
beforeEach(() => {
  approvals = mcpApprovals()
  vi.clearAllMocks()
})
afterEach(() => vi.useRealTimers())

// One 2026-07-28 tools/call, as `mcpHandler` serves it: admitted, with the token's resource in its `authInfo`.
const send = async (name: string, args: object, round: Round = {}, caller: Caller = {}) => {
  const context = { session: caller.session ?? ann, records: records as unknown as ToolRecords, resources: async () => ({ models: [], views: [] }), show: () => {} }
  const tools = caller.tools ?? [...writeRecordTools(), batchWriteTool()]
  const handler = createMcpHandler(
    ({ requestInfo }) => mcpServer({ info: { name: 'App', version: '1.0.0' }, tools, context: { ...context, locale: requestLocale(undefined, requestInfo!) }, report, approvals: caller.approvals ?? approvals }),
    { legacy: 'stateless' },
  )
  const params = {
    name,
    arguments: args,
    ...round,
    _meta: {
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientCapabilities': { elicitation: {} },
      'io.modelcontextprotocol/clientInfo': { name: 'client', version: '1.0.0' },
    },
  }
  const response = await handler.fetch(new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-protocol-version': '2026-07-28',
      'mcp-method': 'tools/call',
      'mcp-name': name,
      ...(caller.acceptLanguage && { 'accept-language': caller.acceptLanguage }),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params }),
  }), { authInfo: { token: 't', clientId: 'client', scopes: ['mcp'], resource: caller.resource ?? resource } })
  const text = await response.text()
  return JSON.parse(text.startsWith('{') ? text : text.split('\n').find((line) => line.startsWith('data: '))!.slice(6))
}

const accept = { action: 'accept', content: { approve: true } }

const ask = async (name: string, args: object, caller?: Caller) => {
  const { result } = await send(name, args, {}, caller)
  expect(result).toMatchObject({ resultType: 'input_required' })
  return { state: result.requestState as string, key: Object.keys(result.inputRequests)[0]! }
}

const answer = async (name: string, args: object, asked: { state: unknown; key: string }, caller?: Caller, given: object = accept) =>
  (await send(name, args, { requestState: asked.state, inputResponses: { [asked.key]: given } }, caller)).result

const asksAgain = (result: { resultType?: string }) => expect(result).toMatchObject({ resultType: 'input_required' })

const operations = (count: number, last = 'a') => Array.from({ length: count }, (_, index) => ({ op: 'create', resource: 'tasks', data: { n: index, last: index === count - 1 ? last : 'a' } }))

const calls: Record<string, object> = {
  create_record: { resource: 'tasks', data: { title: 'x' } },
  update_record: { resource: 'tasks', key: 1, data: { title: 'x' }, etag: '"v1"' },
  delete_record: { resource: 'tasks', key: 1, etag: '"v1"' },
  batch_write: { operations: operations(2) },
}

describe.each(Object.entries(calls))('%s over MCP', (name, args) => {
  it('writes once with the approval it asked for, and asks again when the retry is replayed', async () => {
    const asked = await ask(name, args)
    expect(await answer(name, args, asked)).toMatchObject({ resultType: 'complete' })
    asksAgain(await answer(name, args, asked))
    expect(writes()).toBe(1)
  })

  it('writes once when two copies of one approved retry arrive at once', async () => {
    const asked = await ask(name, args)
    const results = await Promise.all([answer(name, args, asked), answer(name, args, asked)])
    expect(results.filter((result) => result.resultType === 'input_required')).toHaveLength(1)
    expect(writes()).toBe(1)
  })

  it('asks again for an answer without a state, an expired one, or one from another user', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 9, 25, 12) })
    const asked = await ask(name, args)
    asksAgain((await send(name, args, { inputResponses: { [asked.key]: accept } })).result)
    asksAgain(await answer(name, args, asked, { session: { ...ann, user: { id: 2, roles: ['sales'] } } }))
    vi.setSystemTime(Date.UTC(2026, 9, 25, 12) + approvalLifetime)
    asksAgain(await answer(name, args, asked))
    expect(writes()).toBe(0)
  })

  it('asks again for the same user in another scope', async () => {
    for (const caller of [
      { session: { ...ann, organization: { id: 7 } } },
      { session: { ...ann, tenant: 7 } },
      { session: { ...ann, client: { id: 'other', scopes: ['mcp'] } } },
      { resource: new URL('http://localhost/other/mcp') },
    ]) {
      const asked = await ask(name, args)
      asksAgain(await answer(name, args, asked, caller))
    }
    expect(writes()).toBe(0)
  })

  it('asks again for an accept filed under the bare key, or another ask\'s', async () => {
    const first = await ask(name, args)
    const second = await ask(name, args)
    asksAgain(await answer(name, args, { state: second.state, key: first.key }))
    const third = await ask(name, args)
    asksAgain(await answer(name, args, { state: third.state, key: 'approve' }))
    expect(writes()).toBe(0)
  })

  it.each([{ action: 'decline' }, { action: 'decline', content: { approve: true } }, { action: 'cancel' }, { action: 'accept', content: { approve: 1 } }, { action: 'accept' }])('writes nothing for %j', async (given) => {
    const asked = await ask(name, args)
    const result = await answer(name, args, asked, undefined, given)
    expect(result).toMatchObject({ resultType: 'complete' })
    expect(result.content[0].text).toMatch(/not approve/)
    expect(writes()).toBe(0)
  })

  it.each([{ state: 1 }, [], 1, ''])('writes nothing for a requestState of %j', async (state) => {
    const asked = await ask(name, args)
    const sent = await send(name, args, { requestState: state, inputResponses: { [asked.key]: accept } })
    if (sent.result) asksAgain(sent.result)
    else expect(sent.error).toMatchObject({ code: -32602, message: 'Invalid or expired requestState' })
    expect(writes()).toBe(0)
  })
})

describe('an MCP approval', () => {
  it('asks in the language the request accepts, saying a delete is for good', async () => {
    const { result } = await send('delete_record', calls.delete_record!, {}, { acceptLanguage: 'nl-BE, en;q=0.5' })
    const { params } = Object.values(result.inputRequests as Record<string, { params: { message: string; requestedSchema: { properties: { approve: { title: string } } } } }>)[0]!
    expect(params.message).toBe('Tasks #1 verwijderen?\n\nDit kan niet ongedaan worden gemaakt: het record wordt definitief verwijderd.')
    expect(params.requestedSchema.properties.approve.title).toBe('Definitief verwijderen')
  })

  it('holds only for the batch it was asked for, even one that differs past what it shows', async () => {
    const batchA = { operations: operations(60, 'a') }
    const batchB = { operations: operations(60, 'b') }
    asksAgain(await answer('batch_write', batchB, await ask('batch_write', batchA)))
    expect(records.batch).not.toHaveBeenCalled()
  })

  it('holds for neither a reordered batch, nor added fields, nor an own __proto__ key', async () => {
    const batch = { operations: operations(2) }
    const reordered = { operations: [...operations(2)].reverse() }
    const nulled = { operations: operations(2).map((operation) => ({ ...operation, data: { ...operation.data, b: null } })) }
    const proto = JSON.parse(JSON.stringify(batch).replace('"data":{', '"data":{"__proto__":{"n":5},'))
    for (const other of [reordered, nulled, proto]) {
      const result = await answer('batch_write', other, await ask('batch_write', batch))
      if (result.resultType !== 'input_required') expect(result.content[0].text).toMatch(/nothing was written/)
    }
    expect(records.batch).not.toHaveBeenCalled()
  })

  it('holds for neither another record, another resource, nor another tool', async () => {
    const update = calls.update_record!
    asksAgain(await answer('update_record', { ...update, key: 2 }, await ask('update_record', update)))
    asksAgain(await answer('create_record', { resource: 'notes', data: { title: 'x' } }, await ask('create_record', calls.create_record!)))
    asksAgain(await answer('create_record', update, await ask('update_record', update)))
    const remove = calls.delete_record!
    asksAgain(await answer('delete_record', { ...remove, key: 2 }, await ask('delete_record', remove)))
    asksAgain(await answer('update_record', update, await ask('delete_record', remove)))
    asksAgain(await answer('delete_record', remove, await ask('update_record', update)))
    expect(writes()).toBe(0)
  })

  it('authorizes nothing: the access rules still refuse an approved write', async () => {
    records.create.mockRejectedValueOnce(forbidden('access-denied', 'You may not create tasks'))
    const args = calls.create_record!
    const result = await answer('create_record', args, await ask('create_record', args))
    expect(JSON.parse(result.content[0].text)).toEqual({ error: 'access-denied', message: 'You may not create tasks' })
  })

  it('binds the call as sent, whatever the tool changes in its arguments', async () => {
    const stamped = defineTool({
      name: 'stamped',
      description: 'Stamps its arguments, then asks.',
      parameters: { type: 'object', properties: { title: { type: 'string' } } },
      run: async (args, context) => {
        args.stamp = Math.random()
        return (await context.approve({ title: 'Write it?' })) === 'approved' ? 'written' : 'not approved'
      },
    })
    const caller = { tools: [stamped] }
    expect(await answer('stamped', { title: 'x' }, await ask('stamped', { title: 'x' }, caller), caller)).toMatchObject({ content: [{ text: 'written' }] })
    asksAgain(await answer('stamped', { title: 'y' }, await ask('stamped', { title: 'x' }, caller), caller))
  })

  it('ends in a failure without detail when it cannot be asked or bound, and writes nothing', async () => {
    const failed = { content: [{ type: 'text', text: 'The server failed to answer.' }], isError: true }
    const broken = { ask: () => Promise.reject(new Error('mint secret')), check: approvals.check }
    expect((await send('create_record', calls.create_record!, {}, { approvals: broken })).result).toMatchObject(failed)
    const deep = JSON.parse(`${'{"a":'.repeat(40)}1${'}'.repeat(40)}`)
    expect((await send('create_record', { resource: 'tasks', data: deep })).result).toMatchObject(failed)
    expect(report).toHaveBeenCalledTimes(2)
    expect(writes()).toBe(0)
  })
})
