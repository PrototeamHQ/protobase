import { describe, expect, it } from 'vitest'
import { AuthError, createAuthSession } from './auth'

const jwt = (claims: object) => {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${encode({ alg: 'EdDSA' })}.${encode({ exp: Math.floor(Date.now() / 1000) + 900, ...claims })}.signature`
}

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json' } })

type Call = { path: string; method: string; body?: unknown; query: string }

const setup = (respond: (call: Call) => Response) => {
  const calls: Call[] = []
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(String(input), init)
    const url = new URL(request.url)
    const text = await request.text()
    const call = { path: url.pathname.replace('/api/auth', ''), method: request.method, query: url.search, ...(text && { body: JSON.parse(text) }) }
    calls.push(call)
    return respond(call)
  }) as typeof globalThis.fetch
  return { calls, session: createAuthSession({ origin: 'http://localhost', fetch }) }
}

describe('the organizations client', () => {
  it('fetches a new token after switching, which names the new organization', async () => {
    let org = '1'
    const { calls, session } = setup((call) => {
      if (call.path === '/organization/switch') {
        org = (call.body as { organizationId: string }).organizationId
        return json({ organizationId: org })
      }
      return json({ token: jwt({ org }) })
    })
    await session.token()
    await session.organizations.switchTo('2')
    expect(calls.map((call) => call.path)).toEqual(['/token', '/organization/switch', '/token'])
    expect(calls[1]).toMatchObject({ method: 'POST', body: { organizationId: '2' } })
    expect(JSON.parse(atob((await session.token())!.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')))).toMatchObject({ org: '2' })
  })

  it('searches the organizations a page at a time', async () => {
    const found = { organizations: [{ id: '2', name: 'Globex', slug: 'globex' }], total: 21 }
    const { calls, session } = setup(() => json(found))
    expect(await session.organizations.search('glo', 20)).toEqual(found)
    expect(calls[0]).toMatchObject({ path: '/organization/search', method: 'GET' })
    expect(calls[0]!.query).toContain('query=glo')
    expect(calls[0]!.query).toContain('offset=20')
    await session.organizations.search('')
    expect(calls[1]!.query).not.toContain('offset')
  })

  it('reads members with their organization role and app roles', async () => {
    const { calls, session } = setup(() =>
      json({ members: [{ id: 'm1', userId: 'u1', role: 'owner', appRoles: ['manager'], createdAt: '2026-10-01T00:00:00Z', user: { name: '', email: 'bo@example.com' } }] }),
    )
    expect(await session.organizations.members('1')).toEqual([{ id: 'm1', userId: 'u1', name: 'bo@example.com', email: 'bo@example.com', role: 'owner', appRoles: ['manager'], createdAt: '2026-10-01T00:00:00.000Z' }])
    expect(calls[0]).toMatchObject({ path: '/organization/list-members', method: 'GET' })
    expect(calls[0]!.query).toContain('organizationId=1')
  })

  it('gives the link back with an invitation only when the server sends one', async () => {
    const raw = { id: 'i1', email: 'jan@ledger.example', role: 'member', appRoles: ['accountant'], status: 'pending', expiresAt: '2026-10-17T00:00:00Z' }
    const withLink = setup(() => json({ ...raw, link: 'http://localhost/-/invitation?token=t' }))
    expect(await withLink.session.organizations.invite('1', { email: 'jan@ledger.example', role: 'member', appRoles: ['accountant'] })).toEqual({
      invitation: { ...raw, role: 'member', expiresAt: '2026-10-17T00:00:00.000Z' },
      link: 'http://localhost/-/invitation?token=t',
    })
    expect(withLink.calls[0]!.body).toEqual({ organizationId: '1', email: 'jan@ledger.example', role: 'member', appRoles: ['accountant'] })
    const mailed = setup(() => json(raw))
    expect(await mailed.session.organizations.invite('1', { email: 'jan@ledger.example', role: 'member', appRoles: [] })).not.toHaveProperty('link')
  })

  it("lists the person's own invitations with their organization, and accepts one by its id with a new token after", async () => {
    const raw = { id: 'i1', email: 'ana@example.com', role: 'member', appRoles: ['sales'], status: 'pending', expiresAt: '2026-10-17T00:00:00Z', organizationName: 'Acme', organizationId: '1' }
    const { calls, session } = setup((call) => {
      if (call.path === '/organization/list-user-invitations') return json([raw])
      if (call.path === '/invitation/accept-own') return json({ member: { id: 'm1' } })
      return json({ token: jwt({ org: '1' }) })
    })
    expect(await session.organizations.myInvitations()).toEqual([{ id: 'i1', email: 'ana@example.com', role: 'member', appRoles: ['sales'], status: 'pending', expiresAt: '2026-10-17T00:00:00.000Z', organizationName: 'Acme' }])
    await session.organizations.acceptMine('i1')
    expect(calls.map(({ path, method }) => `${method} ${path}`)).toEqual(['GET /organization/list-user-invitations', 'POST /invitation/accept-own', 'GET /token'])
    expect(calls[1]!.body).toEqual({ invitationId: 'i1' })
  })

  it('rejects with the server code', async () => {
    const { session } = setup(() => json({ code: 'APP_ROLE_NOT_GRANTABLE', message: 'You cannot give or take away Accountant' }, { status: 403 }))
    const error = await session.organizations.setAppRoles('m1', ['accountant']).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(AuthError)
    expect(error).toMatchObject({ status: 403, code: 'APP_ROLE_NOT_GRANTABLE', message: 'You cannot give or take away Accountant' })
  })
})
