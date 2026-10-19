import { describe, expect, it } from 'vitest'
import { createAuthSession } from './auth'

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json' } })

type Call = { path: string; method: string; body?: unknown; query: URLSearchParams }

const setup = (respond: (call: Call) => Response) => {
  const calls: Call[] = []
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(String(input), init)
    const url = new URL(request.url)
    const text = await request.text()
    const call = { path: url.pathname.replace('/api/auth', ''), method: request.method, query: url.searchParams, ...(text && { body: JSON.parse(text) }) }
    calls.push(call)
    return respond(call)
  }) as typeof globalThis.fetch
  return { calls, session: createAuthSession({ origin: 'http://localhost', fetch }) }
}

const raw = { id: 'u1', name: '', email: 'ana@example.com', role: 'sales,support', banned: true, createdAt: '2026-10-01T00:00:00Z' }

describe('the users client', () => {
  it('searches the users by address a page at a time, oldest first, with their roles and whether they are blocked', async () => {
    const { calls, session } = setup(() => json({ users: [raw], total: 21, limit: 20, offset: 20 }))
    expect(await session.users.search('ana', 20)).toEqual({
      users: [{ id: 'u1', name: 'ana@example.com', email: 'ana@example.com', roles: ['sales', 'support'], blocked: true, createdAt: '2026-10-01T00:00:00.000Z' }],
      total: 21,
    })
    expect(calls[0]).toMatchObject({ path: '/admin/list-users', method: 'GET' })
    expect(Object.fromEntries(calls[0]!.query)).toEqual({ limit: '20', offset: '20', sortBy: 'createdAt', sortDirection: 'asc', searchValue: 'ana', searchField: 'email' })
    await session.users.search('')
    expect(Object.fromEntries(calls[1]!.query)).toEqual({ limit: '20', sortBy: 'createdAt', sortDirection: 'asc' })
  })

  it('creates, sets roles, blocks and unblocks through the admin endpoints, with roles as a list', async () => {
    const { calls, session } = setup(() => json({ user: raw }))
    await session.users.create({ email: 'bo@example.com', name: 'Bo', roles: ['sales', 'support'] })
    await session.users.create({ email: 'cy@example.com', name: 'Cy', password: 'correct horse battery', roles: ['admin'] })
    await session.users.setRoles('u1', ['support'])
    await session.users.block('u1')
    await session.users.unblock('u1')
    expect(calls.map(({ path, method, body }) => ({ path, method, body }))).toEqual([
      { path: '/admin/create-user', method: 'POST', body: { email: 'bo@example.com', name: 'Bo', role: ['sales', 'support'] } },
      { path: '/admin/create-user', method: 'POST', body: { email: 'cy@example.com', name: 'Cy', role: ['admin'], password: 'correct horse battery' } },
      { path: '/admin/set-role', method: 'POST', body: { userId: 'u1', role: ['support'] } },
      { path: '/admin/ban-user', method: 'POST', body: { userId: 'u1' } },
      { path: '/admin/unban-user', method: 'POST', body: { userId: 'u1' } },
    ])
  })

  it('invites, with the link when the server gives it, lists and revokes invitations, and reads the roles', async () => {
    const invitation = { id: 'i1', email: 'jan@example.com', roles: ['sales'], expiresAt: '2026-10-08T00:00:00.000Z' }
    const { calls, session } = setup((call) => {
      if (call.path === '/users/invite') return json({ ...invitation, link: 'http://localhost/-/invitation?token=t' })
      if (call.path === '/users/invitations') return json({ invitations: [invitation] })
      if (call.path === '/users/roles') return json([{ name: 'sales', label: 'Sales', membership: true, grants: [] }])
      return json({ id: 'i1' })
    })
    expect(await session.users.invite({ email: 'jan@example.com', roles: ['sales'] })).toEqual({ invitation, link: 'http://localhost/-/invitation?token=t' })
    expect(await session.users.invitations()).toEqual([invitation])
    await session.users.revoke('i1')
    expect(await session.users.roles()).toEqual([{ name: 'sales', label: 'Sales', membership: true, grants: [] }])
    expect(calls.map(({ path, method, body }) => ({ path, method, body }))).toEqual([
      { path: '/users/invite', method: 'POST', body: { email: 'jan@example.com', roles: ['sales'] } },
      { path: '/users/invitations', method: 'GET' },
      { path: '/users/invitations/cancel', method: 'POST', body: { id: 'i1' } },
      { path: '/users/roles', method: 'GET' },
    ])
  })

  it('rejects with the server message', async () => {
    const { session } = setup(() => json({ code: 'LAST_ADMIN', message: 'This is the last admin: make someone else an admin first.' }, { status: 400 }))
    await expect(session.users.block('u1')).rejects.toMatchObject({ code: 'LAST_ADMIN', message: 'This is the last admin: make someone else an admin first.' })
  })
})
