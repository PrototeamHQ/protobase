import { describe, expect, it, vi } from 'vitest'
import { unauthorized } from '../problem'
import type { Authenticator, Session } from '../types'
import { mcpGate, sessionOf } from './mcp-gate'

const resource = 'http://localhost:5173/api/mcp'
const encoded = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
const token = `${encoded({ alg: 'none', typ: 'at+jwt' })}.${encoded({ exp: Math.floor(Date.now() / 1000) + 600 })}.signature`
const session: Session = { user: { id: 1, roles: ['sales'] }, client: { id: 'client-1', scopes: ['mcp'] } }
const post = (authorization?: string) => new Request(resource, { method: 'POST', headers: { ...(authorization && { authorization }), dpop: 'proof' }, body: '{}' })
const gateWith = (authenticate: Authenticator) => mcpGate({ authenticate, resource, scope: 'mcp' })

describe('mcpGate', () => {
  it('refuses a request without a token with a challenge naming the resource metadata', async () => {
    const answer = await gateWith(async () => session)(post())
    expect(answer).toBeInstanceOf(Response)
    expect((answer as Response).status).toBe(401)
    expect((answer as Response).headers.get('www-authenticate')).toContain('resource_metadata="http://localhost:5173/.well-known/oauth-protected-resource/api/mcp"')
  })

  it('refuses a token the authenticator refuses', async () => {
    const answer = await gateWith(() => Promise.reject(unauthorized('The token expired')))(post(`Bearer ${token}`))
    expect((answer as Response).status).toBe(401)
  })

  it('rethrows any other failure of the authenticator', async () => {
    await expect(gateWith(() => Promise.reject(new Error('database down')))(post(`Bearer ${token}`))).rejects.toThrow('database down')
  })

  it('refuses a session without the scope with a 403, and one without a client with a 401', async () => {
    expect(((await gateWith(async () => ({ ...session, client: { id: 'client-1', scopes: [] } }))(post(`Bearer ${token}`))) as Response).status).toBe(403)
    expect(((await gateWith(async () => ({ user: session.user }))(post(`Bearer ${token}`))) as Response).status).toBe(401)
  })

  it('passes the request with its DPoP scheme and proof to the authenticator, and admits its session', async () => {
    const authenticate = vi.fn(async (_request: Request) => session)
    const answer = await gateWith(authenticate)(post(`DPoP ${token}`))
    expect(authenticate.mock.calls[0]![0].headers.get('authorization')).toBe(`DPoP ${token}`)
    expect(authenticate.mock.calls[0]![0].headers.get('dpop')).toBe('proof')
    expect(answer).not.toBeInstanceOf(Response)
    expect(sessionOf(answer as Exclude<typeof answer, Response>)).toBe(session)
  })

  it('has no session for a request it did not admit', () => {
    expect(() => sessionOf(undefined)).toThrow('The MCP request carries no session')
  })
})
