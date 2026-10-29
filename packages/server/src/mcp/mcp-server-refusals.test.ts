import { createMcpHandler } from '@modelcontextprotocol/server'
import { QueryError } from '@protobase/query'
import { describe, expect, it, vi } from 'vitest'
import { defineTool, type AssistantTool, type BaseToolContext } from '../assistant/tools'
import { badRequest, forbidden, HttpProblem, notFound, preconditionFailed } from '../problem'
import type { Session } from '../types'
import { mcpApprovals } from './mcp-approval-store'
import { mcpServer } from './mcp-server'

const session: Session = { user: { id: 1, roles: [] } }
const approvals = mcpApprovals()

// A tool on a host's server, with no app records: it throws what `thrown` gives it, or asks before it writes.
const throwing = (thrown: () => unknown) => defineTool<BaseToolContext>({ name: 'throwing', description: 'Throws.', parameters: { type: 'object', properties: {} }, run: async () => { throw thrown() } })
const archive = defineTool<BaseToolContext>({
  name: 'archive',
  title: 'Archive a project',
  description: 'Archives a project once approved.',
  parameters: { type: 'object', properties: {} },
  annotations: { readOnlyHint: false },
  _meta: { securitySchemes: [{ type: 'oauth2', scopes: ['mcp'] }] },
  run: async (_args, { session: caller, approve }) => (await approve({ title: 'Archive it?', approveLabel: 'Archive' })) === 'approved' ? `archived for ${caller.user.id}` : 'kept',
})

const post = async (tools: AssistantTool<BaseToolContext>[], report: (error: unknown) => void, method: string, params: object, modern = false) => {
  const handler = createMcpHandler(() => mcpServer({ info: { name: 'Host', version: '1.0.0' }, tools, context: { session }, report, approvals }), { legacy: 'stateless' })
  const version: Record<string, string> = modern ? { 'mcp-protocol-version': '2026-07-28', 'mcp-method': method, 'mcp-name': 'archive' } : { 'mcp-protocol-version': '2025-11-25' }
  const envelope = modern ? { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': { elicitation: {} }, 'io.modelcontextprotocol/clientInfo': { name: 'client', version: '1.0.0' } } } : {}
  const response = await handler.fetch(new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { accept: 'application/json, text/event-stream', 'content-type': 'application/json', ...version },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: { ...params, ...envelope } }),
  }), { authInfo: { token: 't', clientId: 'client', scopes: ['mcp'], resource: new URL('http://localhost/api/mcp') } })
  const text = await response.text()
  const data = text.startsWith('{') ? text : text.split('\n').find((line) => line.startsWith('data: '))!.slice(6)
  return JSON.parse(data).result
}

const thrownBy = (thrown: () => unknown, report: (error: unknown) => void) => post([throwing(thrown)], report, 'tools/call', { name: 'throwing', arguments: {} })

describe('mcpServer, for a tool that throws', () => {
  it.each([
    ['a 404', () => notFound('No project 7'), 'not-found', 'No project 7'],
    ['a 403', () => forbidden('access-denied', 'Not yours'), 'access-denied', 'Not yours'],
    ['a 412', () => preconditionFailed('The record changed'), 'precondition-failed', 'The record changed'],
    ['a 400', () => badRequest('invalid-argument', 'Pass an id'), 'invalid-argument', 'Pass an id'],
    ['a query error', () => new QueryError('unknown_field', 'Unknown field colour'), 'unknown-field', 'Unknown field colour'],
  ])('answers %s as { error, message }, without reporting it', async (_name, thrown, error, message) => {
    const report = vi.fn()
    expect(await thrownBy(thrown, report)).toEqual({ content: [{ type: 'text', text: JSON.stringify({ error, message }) }], isError: true })
    expect(report).not.toHaveBeenCalled()
  })

  it.each([
    ['a plain error', () => new Error('boom')],
    ['a 500 problem', () => new HttpProblem(500, 'internal-error', 'Internal Server Error', 'secret detail')],
  ])('answers %s as a failure without its message, and reports it once', async (_name, thrown) => {
    const report = vi.fn()
    expect(await thrownBy(thrown, report)).toEqual({ content: [{ type: 'text', text: 'The server failed to answer.' }], isError: true })
    expect(report).toHaveBeenCalledTimes(1)
  })
})

describe('mcpServer, for a host\'s tool without app records', () => {
  it('lists its title and _meta as given', async () => {
    const { tools } = await post([archive], () => {}, 'tools/list', {})
    expect(tools).toMatchObject([{ name: 'archive', title: 'Archive a project', annotations: { readOnlyHint: false }, _meta: { securitySchemes: [{ type: 'oauth2', scopes: ['mcp'] }] } }])
  })

  it('runs with the session, and asks before it writes', async () => {
    const asked = await post([archive], () => {}, 'tools/call', { name: 'archive', arguments: {} }, true)
    expect(asked).toMatchObject({ resultType: 'input_required' })
    const [key] = Object.keys(asked.inputRequests)
    const answered = { name: 'archive', arguments: {}, requestState: asked.requestState, inputResponses: { [key!]: { action: 'accept', content: { approve: true } } } }
    expect(await post([archive], () => {}, 'tools/call', answered, true)).toMatchObject({ content: [{ type: 'text', text: 'archived for 1' }] })
  })
})
