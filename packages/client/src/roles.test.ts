import { describe, expect, it } from 'vitest'
import { AuthError, createAuthSession } from './auth'

const jwt = (claims: object) => {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${encode({ alg: 'EdDSA' })}.${encode({ exp: Math.floor(Date.now() / 1000) + 900, ...claims })}.signature`
}

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json' } })

const setup = (respond: (path: string, body: unknown) => Response) => {
  const calls: { path: string; method: string; body?: unknown }[] = []
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(String(input), init)
    const path = new URL(request.url).pathname.replace('/api/auth', '')
    const text = await request.text()
    const body = text ? JSON.parse(text) : undefined
    calls.push({ path, method: request.method, ...(body !== undefined && { body }) })
    return respond(path, body)
  }) as typeof globalThis.fetch
  return { calls, session: createAuthSession({ origin: 'http://localhost', fetch }) }
}

describe('the roles client', () => {
  it('fetches a new token after switching, which carries the new role', async () => {
    let role = 'admin'
    const { calls, session } = setup((path, body) => {
      if (path === '/role/switch') {
        role = (body as { role: string }).role
        return json({ role })
      }
      return json({ token: jwt({ role }) })
    })
    await session.token()
    await session.roles.switchTo('sales')
    expect(calls.map((call) => call.path)).toEqual(['/token', '/role/switch', '/token'])
    expect(calls[1]).toMatchObject({ method: 'POST', body: { role: 'sales' } })
    expect(JSON.parse(atob((await session.token())!.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')))).toMatchObject({ role: 'sales' })
  })

  it('reads the active role and the roles to switch to, and rejects a role the person does not hold', async () => {
    const roles = { active: 'admin', roles: [{ name: 'admin', label: 'Superuser' }, { name: 'sales', label: 'Sales' }] }
    const { session } = setup((path) => (path === '/role/current' ? json(roles) : json({ code: 'ROLE_NOT_HELD', message: 'You do not hold this role.' }, { status: 403 })))
    expect(await session.roles.current()).toEqual(roles)
    const refused = await session.roles.switchTo('manager').catch((error: unknown) => error)
    expect(refused).toBeInstanceOf(AuthError)
    expect(refused).toMatchObject({ status: 403, code: 'ROLE_NOT_HELD', message: 'You do not hold this role.' })
  })
})
