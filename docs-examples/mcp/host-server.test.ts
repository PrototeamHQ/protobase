import { describe, expect, it, vi } from 'vitest'
import type { Session } from '@protobase/server'
import { projectsEndpoint } from './host-server'

// The documentation shows this host's endpoint; this keeps what it says about it true.

const ann: Session = { user: { id: 'ann', roles: [] }, client: { id: 'client', scopes: ['mcp'] } }
const bob: Session = { ...ann, user: { id: 'bob', roles: [] } }
const encoded = (part: object) => Buffer.from(JSON.stringify(part)).toString('base64url')
const token = `${encoded({ alg: 'none' })}.${encoded({ exp: Math.floor(Date.now() / 1000) + 3600 })}.`

const modern = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientCapabilities': { elicitation: {} },
  'io.modelcontextprotocol/clientInfo': { name: 'client', version: '1.0.0' },
}

const post = async (session: Session, method: string, params: Record<string, unknown>) => {
  const endpoint = projectsEndpoint(async () => session)
  const headers: Record<string, string> = method === 'tools/call'
    ? { 'mcp-protocol-version': '2026-07-28', 'mcp-method': method, 'mcp-name': String(params.name) }
    : { 'mcp-protocol-version': '2025-11-25' }
  const response = await endpoint(new Request('https://console.example.com/api/mcp', {
    method: 'POST',
    headers: { accept: 'application/json, text/event-stream', 'content-type': 'application/json', host: 'console.example.com', authorization: `Bearer ${token}`, ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: method === 'tools/call' ? { ...params, _meta: modern } : params }),
  }))
  const text = await response.text()
  const data = text.startsWith('{') ? text : text.split('\n').find((line) => line.startsWith('data: '))!.slice(6)
  return JSON.parse(data).result
}

describe('a host serving its own tools on mcpServer', () => {
  it('lists its tool with its title and _meta', async () => {
    const { tools } = await post(ann, 'tools/list', {})
    expect(tools).toMatchObject([{ name: 'archive_project', title: 'Archive a project', _meta: { securitySchemes: [{ type: 'oauth2', scopes: ['mcp'] }] } }])
  })

  it('refuses another person\'s project as { error, message }, unreported', async () => {
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await post(bob, 'tools/call', { name: 'archive_project', arguments: { id: 1 } })).toMatchObject({
      content: [{ type: 'text', text: JSON.stringify({ error: 'not-found', message: 'No project 1' }) }],
      isError: true,
    })
    expect(report).not.toHaveBeenCalled()
    report.mockRestore()
  })

  it('asks the person before it archives, and archives once they approve', async () => {
    const asked = await post(ann, 'tools/call', { name: 'archive_project', arguments: { id: 1 } })
    expect(asked).toMatchObject({ resultType: 'input_required' })
    const [key] = Object.keys(asked.inputRequests)
    const answered = { name: 'archive_project', arguments: { id: 1 }, requestState: asked.requestState, inputResponses: { [key!]: { action: 'accept', content: { approve: true } } } }
    expect(await post(ann, 'tools/call', answered)).toMatchObject({ content: [{ type: 'text', text: JSON.stringify({ archived: true }) }] })
  })
})
