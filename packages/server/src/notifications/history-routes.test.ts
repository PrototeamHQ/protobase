import { Hono } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createErrorHandler } from '../error-handler'
import { MissingCredentials } from '../problem'
import type { AdminEnv, Session } from '../types'
import type { StoredNotification } from './history'
import { historyCursor } from './history-cursor'
import { maxHistoryPage, type HistoryStore } from './history-store'
import { defaultHistoryPage, historyRoutes } from './history-routes'
import { historyPath } from './paths'
import { note } from './testing/history-store-contract'
import { memoryHistoryStore } from './testing/memory-history-store'

const own = (id: string): Session => ({ user: { id, roles: ['user'] }, signIn: { session: `session-${id}`, staff: false } })
const sessions: Record<string, Session> = {
  a: own('a'),
  b: own('b'),
  admin: { ...own('admin'), user: { id: 'admin', roles: ['admin'] } },
  staff: { ...own('a'), signIn: { session: 'session-a', staff: true } },
  unmarked: { user: { id: 'a', roles: [] } },
  client: { ...own('a'), client: { id: 'mcp', scopes: [] } },
}

// Every call the store gets, by method, with its arguments.
const counted = (store: HistoryStore) => {
  const calls: [string, unknown[]][] = []
  const wrapped = Object.fromEntries(Object.entries(store).map(([name, method]) => [name, (...args: unknown[]) => (calls.push([name, args]), (method as (...a: unknown[]) => unknown)(...args))])) as HistoryStore
  return { store: wrapped, calls }
}

// The routes as createAdmin mounts them: behind an authenticator, with the API's error handler.
const serve = (store: HistoryStore, origins: string[] = ['https://app.example.com']) => {
  const reported: unknown[] = []
  const app = new Hono<AdminEnv>()
  app.onError(createErrorHandler((error) => void reported.push(error)))
  app.use('*', async (c, next) => {
    const session = sessions[c.req.header('x-as') ?? '']
    if (!session) throw new MissingCredentials('Send a bearer token')
    c.set('session', session)
    await next()
  })
  app.route(historyPath('/api'), historyRoutes(store, origins))
  const json = { 'content-type': 'application/json' }
  const get = (as: string, path: string, headers: Record<string, string> = {}) => app.request(path, { headers: { 'x-as': as, ...headers } })
  const post = (as: string, path: string, body?: unknown, headers: Record<string, string> = json) =>
    app.request(path, { method: 'POST', headers: { 'x-as': as, ...headers }, ...(body !== undefined && { body: typeof body === 'string' ? body : JSON.stringify(body) }) })
  const list = (as: string, query = '') => get(as, `${historyPath('/api')}${query}`)
  const unread = (as: string) => get(as, historyPath('/api', 'unread'))
  const markOne = (as: string, id: string, body?: unknown) => post(as, historyPath('/api', { read: id }), body)
  const markAll = (as: string, body: unknown) => post(as, historyPath('/api', 'read'), body)
  return { app, get, post, list, unread, markOne, markAll, reported }
}

const minute = (n: number) => new Date(Date.UTC(2026, 6, 1, 0, n))

// A store holding a's entries at minutes 1 to `count`, b's one at minute 0.
const filled = async (count = 3) => {
  vi.useFakeTimers({ toFake: ['Date'] })
  const memory = memoryHistoryStore()
  vi.setSystemTime(minute(0))
  const theirs = await memory.record('b', { ...note(0), title: 'B secret' })
  const ownEntries: StoredNotification[] = []
  for (let n = 1; n <= count; n++) {
    vi.setSystemTime(minute(n))
    ownEntries.push(await memory.record('a', note(n)))
  }
  vi.useRealTimers()
  return { memory, theirs, own: ownEntries }
}

const readAts = (memory: ReturnType<typeof memoryHistoryStore>) => Object.fromEntries([...memory.entries.values()].map((entry) => [entry.title, entry.readAt]))

afterEach(() => {
  vi.useRealTimers()
})

describe('the history endpoints', () => {
  it("list the caller's own, newest first, page by page, with only the documented fields", async () => {
    const { memory, own } = await filled(3)
    const { list } = serve(memory)
    const first = await list('a', '?limit=2')
    expect(first.status).toBe(200)
    expect(first.headers.get('content-type')).toMatch(/^application\/json/)
    expect(first.headers.get('cache-control')).toBe('no-store')
    const page = await first.json()
    expect(page.items.map((item: { title: string }) => item.title)).toEqual(['Notification 3', 'Notification 2'])
    expect(Object.keys(page.items[0]).sort()).toEqual(['body', 'createdAt', 'data', 'id', 'readAt', 'title', 'url'])
    const second = await (await list('a', `?limit=2&cursor=${page.next}`)).json()
    expect(second).toEqual({ items: [{ id: own[0]!.id, title: 'Notification 1', body: null, url: null, data: null, createdAt: minute(1).toISOString(), readAt: null }], next: null })
  })

  it(`take ${defaultHistoryPage} by default and at most ${maxHistoryPage}, refusing any other limit before the store`, async () => {
    const { store, calls } = counted(memoryHistoryStore())
    const { list } = serve(store)
    expect((await list('a')).status).toBe(200)
    expect((await list('a', `?limit=${maxHistoryPage}`)).status).toBe(200)
    expect(calls.map(([, args]) => (args[1] as { limit: number }).limit)).toEqual([defaultHistoryPage, maxHistoryPage])
    for (const limit of ['0', '-1', '2.5', 'abc', '', `${maxHistoryPage + 1}`, '1e1', '01']) expect((await list('a', `?limit=${limit}`)).status).toBe(400)
    expect(calls).toHaveLength(2)
  })

  it('count the unread ones', async () => {
    const { memory, own } = await filled(3)
    await memory.markRead('a', own[0]!.id)
    const { unread } = serve(memory)
    const response = await unread('a')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ count: 2 })
  })

  it.each([
    ['a visitor', '', 401],
    ['staff signed in as the user', 'staff', 403],
    ['a session its authenticator does not mark as a sign-in', 'unmarked', 403],
    ['an outside app acting for the user', 'client', 403],
  ])('refuse %s on every endpoint without calling the store', async (_, as, status) => {
    const { memory, own } = await filled(1)
    const { store, calls } = counted(memory)
    const { list, unread, markOne, markAll } = serve(store)
    expect((await list(as)).status).toBe(status)
    expect((await unread(as)).status).toBe(status)
    expect((await markOne(as, own[0]!.id)).status).toBe(status)
    expect((await markAll(as, { upTo: minute(9).toISOString() })).status).toBe(status)
    expect(calls).toEqual([])
    expect(own[0]!.readAt).toBeNull()
    expect(readAts(memory)['Notification 1']).toBeNull()
  })

  it('refuse a user named in the query or body, and ignore one in a header, for an admin too', async () => {
    const { memory, theirs } = await filled(1)
    const { list, unread, markOne, markAll, get } = serve(memory)
    for (const as of ['a', 'admin']) {
      for (const query of ['?user=b', '?userId=b', '?user_id=b', '?sort=user', '?filter=b', '?limit=5&limit=6']) {
        expect((await list(as, query)).status).toBe(400)
        expect((await get(as, `${historyPath('/api', 'unread')}${query}`)).status).toBe(400)
      }
      expect((await markAll(as, { upTo: minute(9).toISOString(), user: 'b' })).status).toBe(400)
      expect((await markAll(as, { upTo: minute(9).toISOString(), userId: 'b' })).status).toBe(400)
      expect((await markOne(as, theirs.id, { userId: 'b' })).status).toBe(400)
    }
    expect(readAts(memory)['B secret']).toBeNull()
    const listed = await (await get('a', historyPath('/api'), { 'x-user-id': 'b' })).json()
    expect(listed.items.map((item: { title: string }) => item.title)).toEqual(['Notification 1'])
    expect(await (await get('a', historyPath('/api', 'unread'), { 'x-user-id': 'b' })).json()).toEqual({ count: 1 })
    expect(await (await unread('admin')).json()).toEqual({ count: 0 })
  })

  it("give only the caller's own for a cursor from another user's list, and refuse a bad cursor before the store", async () => {
    const { memory, theirs } = await filled(2)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(minute(5))
    await memory.record('b', { ...note(5), title: 'B later' })
    vi.useRealTimers()
    const { store, calls } = counted(memory)
    const { list } = serve(store)
    const foreign = historyCursor({ createdAt: minute(5), id: theirs.id })
    const page = await (await list('a', `?cursor=${foreign}`)).json()
    expect(page.items.map((item: { title: string }) => item.title)).toEqual(['Notification 2', 'Notification 1'])
    calls.length = 0
    for (const cursor of ['garbage!', foreign.slice(0, -4), Buffer.from(JSON.stringify({ t: 1, i: theirs.id, u: 'b' })).toString('base64url'), "'%20or%201=1"]) {
      const response = await list('a', `?cursor=${cursor}`)
      expect(response.status).toBe(400)
      const text = await response.text()
      expect(text).not.toMatch(/JSON|Unexpected|SyntaxError|at /)
    }
    expect(calls).toEqual([])
  })

  it('mark nothing on a GET to a mark path', async () => {
    const { memory, own } = await filled(1)
    const { get } = serve(memory)
    for (const path of [historyPath('/api', 'read'), historyPath('/api', { read: own[0]!.id })]) expect((await get('a', path)).status).toBeGreaterThanOrEqual(400)
    expect(readAts(memory)['Notification 1']).toBeNull()
  })

  it('take a mark as JSON only, refusing a form or plain text before the store', async () => {
    const { memory, own } = await filled(1)
    const { store, calls } = counted(memory)
    const { post } = serve(store)
    for (const path of [historyPath('/api', 'read'), historyPath('/api', { read: own[0]!.id })]) {
      expect((await post('a', path, 'upTo=2030-01-01T00:00:00Z', { 'content-type': 'application/x-www-form-urlencoded' })).status).toBe(415)
      expect((await post('a', path, JSON.stringify({ upTo: minute(9).toISOString() }), { 'content-type': 'text/plain' })).status).toBe(415)
      expect((await post('a', path, undefined, {})).status).toBe(415)
    }
    expect(calls).toEqual([])
    expect(readAts(memory)['Notification 1']).toBeNull()
  })

  it('mark one read at the time of the request, refusing a body that sets anything', async () => {
    const { memory, own } = await filled(1)
    const { markOne } = serve(memory)
    const id = own[0]!.id
    for (const body of [{ read_at: minute(0).toISOString() }, { readAt: null }, { user: 'b' }, { title: 'x' }, { url: '/x' }, { data: {} }, [], 'null', '{"__proto__":{}}', '{']) {
      expect((await markOne('a', id, body)).status).toBe(400)
    }
    expect(readAts(memory)['Notification 1']).toBeNull()
    const start = Date.now()
    expect((await markOne('a', id, {})).status).toBe(204)
    const readAt = memory.entries.get(id)!.readAt!.getTime()
    expect(readAt).toBeGreaterThanOrEqual(start)
    expect(readAt).toBeLessThanOrEqual(Date.now())
    expect((await markOne('a', own[0]!.id)).status).toBe(204)
  })

  it("answer alike for another's, an unknown and a malformed id, calling the store with plain ids only", async () => {
    const { memory, theirs } = await filled(1)
    const { store, calls } = counted(memory)
    const { post, markOne } = serve(store)
    const answers = [await markOne('a', theirs.id), await markOne('a', '00000000-0000-4000-8000-000000000000')]
    for (const id of ['x'.repeat(10_000), "'%20or%201=1", 'a%2Fb', '%7B%22%24ne%22%3Anull%7D']) answers.push(await post('a', `${historyPath('/api')}/${id}/read`))
    answers.push(await post('a', `${historyPath('/api')}//read`))
    const first = answers[0]!
    for (const answer of answers.slice(0, 2)) {
      expect(answer.status).toBe(204)
      expect(await answer.text()).toBe('')
      expect([...answer.headers.entries()]).toEqual([...first.headers.entries()])
    }
    for (const answer of answers.slice(2)) {
      expect(answer.status === 204 || answer.status === 404).toBe(true)
      expect(await answer.text()).not.toMatch(/select|update|notifications|history|stack/i)
    }
    expect(calls.map(([name, [, id]]) => [name, typeof id])).toEqual([
      ['markRead', 'string'],
      ['markRead', 'string'],
    ])
    expect(readAts(memory)['B secret']).toBeNull()
  })

  it('mark all read up to the newest the caller was shown, and refuse a mark without it', async () => {
    const { memory, own } = await filled(2)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(minute(3))
    await memory.record('a', note(3))
    vi.setSystemTime(minute(4))
    await memory.markRead('a', own[0]!.id)
    vi.useRealTimers()
    const { markAll } = serve(memory)
    for (const body of [{}, { upTo: 'yesterday' }, { upTo: 5 }, { upTo: minute(2).toISOString(), extra: 1 }, undefined]) expect((await markAll('a', body)).status).toBe(400)
    expect((await markAll('a', { upTo: own[1]!.createdAt.toISOString() })).status).toBe(204)
    const read = readAts(memory)
    expect(read['Notification 1']).toEqual(minute(4))
    expect(read['Notification 2']).toBeInstanceOf(Date)
    expect(read['Notification 3']).toBeNull()
    expect(read['B secret']).toBeNull()
  })

  it("answer a generic 500 when a store answers with another user's entry, showing nothing of it", async () => {
    const { memory, theirs } = await filled(1)
    const { list } = serve({ ...memory, list: async () => [theirs] })
    const response = await list('a')
    expect(response.status).toBe(500)
    const text = await response.text()
    for (const secret of [theirs.id, 'B secret', theirs.createdAt.toISOString(), String(theirs.createdAt.getTime())]) expect(text).not.toContain(secret)
    const { unread } = serve({ ...memory, countUnread: async () => -1 })
    expect((await unread('a')).status).toBe(500)
  })

  it('answer only the documented fields of what a store keeps', async () => {
    const { memory } = await filled(1)
    const entry = (await memory.list('a', { limit: 1 }))[0]!
    const { list } = serve({ ...memory, list: async () => [{ ...entry, token: 'secret-token', internal: 7 } as StoredNotification] })
    const text = await (await list('a')).text()
    expect(text).not.toContain('secret-token')
    expect(text).not.toContain('internal')
    expect(text).not.toContain('"userId"')
  })

  it("answer null for a url that is neither a path nor on the app's own origin", async () => {
    const memory = memoryHistoryStore()
    const urls = ['javascript:alert(1)', 'data:text/html,x', '//evil.example', '/\\evil.example', '/\t/evil.example', 'https://evil.example', '/tasks/1', 'https://app.example.com/tasks/2']
    for (const url of urls) {
      // Written as a store would hold it, past what record checks.
      const stored = await memory.record('a', note())
      memory.entries.get(stored.id)!.url = url
    }
    const { list } = serve(memory)
    const page = await (await list('a', '?limit=50')).json()
    expect(page.items.map((item: { url: string | null }) => item.url).sort()).toEqual([null, null, null, null, null, null, '/tasks/1', 'https://app.example.com/tasks/2'].sort())
    expect(page.items.every((item: { title: string }) => item.title === 'Notification 1')).toBe(true)
  })

  it.each(['list', 'countUnread', 'markRead', 'markAllRead'] as const)('answer a generic 500 that names nothing of the store when %s fails', async (method) => {
    const { memory, own } = await filled(1)
    const failure = () => Promise.reject(new Error('select from "notifications"."history" failed at postgres://user:secret@db'))
    const { list, unread, markOne, markAll } = serve({ ...memory, [method]: failure })
    const response = await { list: () => list('a'), countUnread: () => unread('a'), markRead: () => markOne('a', own[0]!.id), markAllRead: () => markAll('a', { upTo: minute(9).toISOString() }) }[method]()
    expect(response.status).toBe(500)
    const { instance: _, ...problem } = await response.json()
    expect(problem).toEqual({ type: 'urn:protobase:problem:internal-error', title: 'Internal Server Error', status: 500, detail: 'The server failed to handle the request' })
  })
})
