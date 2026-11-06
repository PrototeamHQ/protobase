import { describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '../../assistant/tools'
import { mcpApprovals } from '../../mcp/mcp-approval-store'
import { mcpHandler } from '../../mcp/mcp-handler'
import { mcpServer } from '../../mcp/mcp-server'
import { unauthorized } from '../../problem'
import type { Session } from '../../types'
import { listConnectionsTool, type ListConnections } from './connection-tools'

const session: Session = { user: { id: 'u-ana', roles: ['builder'] }, client: { id: 'client-1', scopes: ['mcp'] } }
const context = { session } as ToolContext

// What the list may carry beyond what the tool gives, a token-like field included, as a careless list would.
const listed = [
  {
    key: 'acme:account',
    label: 'Acme account',
    provider: 'workflow-acme-account',
    link_params: { prompt: 'consent' },
    accounts: [{ id: 'acc-1', scopes: ['openid'], needs_sign_in: false, created_at: '2026-11-02T09:00:00Z', used_by: [{ id: 'wf-1', name: 'Report' }], accessToken: 'token-value', userId: 'u-ana' }],
  },
]

describe('list_connections', () => {
  it("gives only each connection's key and label and its accounts' id, scopes and needs_sign_in", async () => {
    const answer = await listConnectionsTool(async () => listed).run({}, context)
    expect(JSON.parse(answer)).toEqual({ connections: [{ key: 'acme:account', label: 'Acme account', accounts: [{ id: 'acc-1', scopes: ['openid'], needs_sign_in: false }] }] })
    expect(answer).not.toContain('token-value')
  })

  it("lists the session's own accounts, whatever person or account the arguments name", async () => {
    const list = vi.fn<ListConnections>(async () => [])
    await listConnectionsTool(list).run({ user_id: 'u-bob', account_id: 'acc-bob', filter: 'all' }, context)
    expect(list).toHaveBeenCalledExactlyOnceWith(session)
  })

  it('lists no connection in an app without connected accounts', async () => {
    expect(JSON.parse(await listConnectionsTool(undefined).run({}, context))).toEqual({ connections: [] })
  })

  it('takes no argument', () => {
    expect(listConnectionsTool(undefined).parameters).toEqual({ type: 'object', properties: {} })
  })
})

describe('list_connections over the MCP endpoint', () => {
  const resource = 'http://localhost/api/mcp'
  const handlerWith = (authenticate: () => Promise<Session>, list: ListConnections) =>
    mcpHandler({
      authenticate,
      resource,
      scope: 'mcp',
      server: (caller) => mcpServer({ info: { name: 'App', version: '1.0.0' }, tools: [listConnectionsTool(list)], context: { ...context, session: caller }, report: () => {}, approvals: mcpApprovals() }),
    })
  const call = (authorization?: string) =>
    new Request(resource, {
      method: 'POST',
      headers: { host: 'localhost', accept: 'application/json, text/event-stream', 'content-type': 'application/json', 'mcp-protocol-version': '2025-11-25', ...(authorization && { authorization }) },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_connections', arguments: {} } }),
    })

  it('refuses a call without a token, or with one the authenticator refuses, before the tool lists anything', async () => {
    const list = vi.fn<ListConnections>(async () => listed)
    const without = await handlerWith(async () => session, list)(call())
    const refused = await handlerWith(() => Promise.reject(unauthorized('The token was revoked')), list)(call('Bearer revoked.token.value'))
    for (const answer of [without, refused]) {
      expect(answer.status).toBe(401)
      expect(await answer.text()).not.toContain('acc-1')
    }
    expect(list).not.toHaveBeenCalled()
  })
})
