import { Hono } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createErrorHandler } from '../error-handler'
import { MissingCredentials } from '../problem'
import type { AdminEnv, Session } from '../types'
import type { DeviceStore } from './device-store'
import { devicesPath } from './paths'
import { deviceRoutes, maxDevicesPerUser } from './routes'
import { memoryDeviceStore } from './testing/memory-store'

const own = (id: string): Session => ({ user: { id, roles: ['user'] }, signIn: { session: `session-${id}`, staff: false } })
const staff = (id: string): Session => ({ ...own(id), signIn: { session: `session-${id}`, staff: true } })

const p256dh = Buffer.alloc(65, 4).toString('base64url')
const auth = Buffer.alloc(16, 1).toString('base64url')
const endpoint = (n: number) => `https://fcm.googleapis.com/fcm/send/device-${n}`
const web = (n = 1) => ({ kind: 'web', endpoint: endpoint(n), keys: { p256dh, auth } })
const apns = { kind: 'apns', token: 'ab'.repeat(32), environment: 'production', appId: 'net.example.app' }

// Every call the store gets, by method.
const counted = (store: DeviceStore) => {
  const calls: string[] = []
  const wrapped = Object.fromEntries(
    Object.entries(store).map(([name, method]) => [name, (...args: unknown[]) => (calls.push(name), (method as (...a: unknown[]) => unknown)(...args))]),
  ) as DeviceStore
  return { store: wrapped, calls }
}

// The routes as createAdmin mounts them: behind an authenticator, with the API's error handler.
const serve = (store: DeviceStore, caller: (request: Request) => Session | Promise<Session>) => {
  const reported: unknown[] = []
  const app = new Hono<AdminEnv>()
  app.onError(createErrorHandler((error) => void reported.push(error)))
  app.use('*', async (c, next) => {
    c.set('session', await caller(c.req.raw))
    await next()
  })
  app.route(devicesPath('/api'), deviceRoutes(store))
  // Who is signed in comes from the test's header, never from the body.
  const request = (path: string, init: RequestInit = {}) => app.request(path, init)
  const register = (as: string, body: unknown) =>
    request(devicesPath('/api'), { method: 'POST', headers: { 'content-type': 'application/json', 'x-as': as }, body: JSON.stringify(body) })
  const remove = (as: string, id: string) => request(devicesPath('/api', id), { method: 'DELETE', headers: { 'x-as': as } })
  return { request, register, remove, reported }
}

const byHeader = (sessions: Record<string, Session>) => (request: Request) => {
  const session = sessions[request.headers.get('x-as') ?? '']
  if (!session) throw new MissingCredentials('Send a bearer token')
  return session
}

const users = byHeader({ a: own('a'), b: own('b'), staff: staff('a'), marked: { user: { id: 'a', roles: [] } } })

afterEach(() => {
  vi.useRealTimers()
})

describe('the device endpoints', () => {
  it("register the caller's device and answer only its id, kind and times", async () => {
    const memory = memoryDeviceStore()
    const { register } = serve(memory, users)
    const response = await register('a', { ...web(), userAgent: 'Mozilla/5.0' })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(Object.keys(body).sort()).toEqual(['createdAt', 'id', 'kind', 'lastSeenAt'])
    expect([...memory.devices.values()]).toEqual([expect.objectContaining({ id: body.id, userId: 'a', token: endpoint(1), userAgent: 'Mozilla/5.0' })])
  })

  it.each([
    ['a visitor', ''],
    ['staff signed in as the user', 'staff'],
    ['a session its authenticator does not mark as a sign-in', 'marked'],
  ])('refuse %s on both endpoints before reading anything', async (_, as) => {
    const memory = memoryDeviceStore()
    const kept = await memory.register('a', { kind: 'fcm', token: 'kept', p256dh: null, auth: null, environment: null, appId: null, userAgent: null })
    const { store, calls } = counted(memory)
    const { request } = serve(store, users)
    const status = as === '' ? 401 : 403
    // A form body as well, which the caller check refuses before the content type is looked at.
    expect((await request(devicesPath('/api'), { method: 'POST', headers: { 'content-type': 'text/plain', 'x-as': as }, body: 'x' })).status).toBe(status)
    expect((await request(devicesPath('/api'), { method: 'POST', headers: { 'content-type': 'application/json', 'x-as': as }, body: JSON.stringify(web()) })).status).toBe(status)
    expect((await request(devicesPath('/api', kept.id), { method: 'DELETE', headers: { 'x-as': as } })).status).toBe(status)
    expect(calls).toEqual([])
    expect([...memory.devices.values()]).toEqual([kept])
  })

  it('refuse without calling the store when the session lookup fails', async () => {
    const { store, calls } = counted(memoryDeviceStore())
    const { register } = serve(store, () => Promise.reject(new Error('session store down')))
    expect((await register('a', web())).status).toBe(500)
    expect(calls).toEqual([])
  })

  it('take JSON only, posted, within its size', async () => {
    const { store, calls } = counted(memoryDeviceStore())
    const { request } = serve(store, users)
    const path = devicesPath('/api')
    expect((await request(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-as': 'a' }, body: 'kind=fcm' })).status).toBe(415)
    expect((await request(path, { method: 'POST', headers: { 'content-type': 'text/plain', 'x-as': 'a' }, body: JSON.stringify(web()) })).status).toBe(415)
    expect((await request(path, { method: 'POST', headers: { 'x-as': 'a' }, body: JSON.stringify(web()) })).status).toBe(415)
    expect((await request(path, { headers: { 'x-as': 'a' } })).status).toBe(404)
    // A streamed body without a length is counted as it is read.
    const chunk = new TextEncoder().encode(`{"kind":"fcm","token":"${'a'.repeat(9000)}"}`)
    const stream = new ReadableStream({ start: (controller) => (controller.enqueue(chunk), controller.close()) })
    const large = await request(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-as': 'a' }, body: stream, duplex: 'half' } as RequestInit)
    expect(large.status).toBe(413)
    expect(calls).toEqual([])
  })

  it('refuse a body that names a user, an id or times, storing nothing', async () => {
    const memory = memoryDeviceStore()
    const { register, request } = serve(memory, users)
    for (const extra of [{ userId: 'b' }, { user_id: 'b' }, { owner: 'b' }, { id: '00000000-0000-4000-8000-000000000000' }, { createdAt: '2020-01-01' }, { lastSeenAt: '2020-01-01' }]) {
      expect((await register('a', { ...web(), ...extra })).status).toBe(400)
    }
    const proto = await request(devicesPath('/api'), { method: 'POST', headers: { 'content-type': 'application/json', 'x-as': 'a' }, body: `{"kind":"fcm","token":"abc","__proto__":{"userId":"b"}}` })
    expect(proto.status).toBe(400)
    // Nor does the query string name anyone.
    expect((await request(`${devicesPath('/api')}?userId=b`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-as': 'a' }, body: JSON.stringify(web()) })).status).toBe(200)
    expect([...memory.devices.values()].map((device) => device.userId)).toEqual(['a'])
  })

  it('move a token to whoever registers it next, answering as a first registration', async () => {
    const memory = memoryDeviceStore()
    const { register, remove } = serve(memory, users)
    const first = await (await register('a', { ...apns, userAgent: 'iPhone A' })).json()
    const moved = await register('b', apns)
    expect(moved.status).toBe(200)
    const body = await moved.json()
    expect(Object.keys(body).sort()).toEqual(['createdAt', 'id', 'kind', 'lastSeenAt'])
    expect(body.id).not.toBe(first.id)
    // A's remove by the id it was given answers as for a device that never existed, and leaves B's.
    const removed = await remove('a', first.id)
    expect(removed.status).toBe(204)
    expect(await removed.text()).toBe('')
    expect([...memory.devices.values()]).toEqual([expect.objectContaining({ id: body.id, userId: 'b', userAgent: null })])
  })

  it('keep one device for two spellings of one web endpoint', async () => {
    const memory = memoryDeviceStore()
    const { register } = serve(memory, users)
    await register('a', web())
    expect((await register('b', { ...web(), endpoint: endpoint(1).replace('fcm.googleapis.com', 'FCM.GoogleAPIs.com') })).status).toBe(200)
    expect([...memory.devices.values()]).toEqual([expect.objectContaining({ userId: 'b', token: endpoint(1) })])
  })

  it("remove the caller's own device, and answer alike for another's, a missing or a malformed id", async () => {
    const memory = memoryDeviceStore()
    const { register, remove } = serve(memory, users)
    const a = await (await register('a', web(1))).json()
    const b = await (await register('b', web(2))).json()
    for (const id of [b.id, '00000000-0000-4000-8000-000000000000', 'not-a-uuid', "'; drop table x"]) expect((await remove('a', id)).status).toBe(204)
    expect([...memory.devices.keys()].sort()).toEqual([a.id, b.id].sort())
    expect((await remove('a', a.id)).status).toBe(204)
    expect([...memory.devices.keys()]).toEqual([b.id])
  })

  it("never remove another user's device through a store that forgets to check its user", async () => {
    const memory = memoryDeviceStore()
    const broken: DeviceStore = { ...memory, remove: async (_userId, id) => void memory.devices.delete(id) }
    const { register, remove } = serve(broken, users)
    const a = await (await register('a', web(1))).json()
    expect((await remove('b', a.id)).status).toBe(204)
    expect([...memory.devices.keys()]).toEqual([a.id])
  })

  it("answer a generic 500 when a store gives back another user's device", async () => {
    const memory = memoryDeviceStore()
    const other = await memory.register('a', { kind: 'fcm', token: 'theirs', p256dh: null, auth: null, environment: null, appId: null, userAgent: null })
    const { register } = serve({ ...memory, register: async () => other }, users)
    const response = await register('b', { kind: 'fcm', token: 'mine' })
    expect(response.status).toBe(500)
    const text = await response.text()
    expect(text).not.toContain(other.id)
    expect(text).not.toContain('theirs')
  })

  it('answer a generic 500 that names nothing of the store when it fails', async () => {
    const memory = memoryDeviceStore()
    const { register } = serve({ ...memory, register: () => Promise.reject(new Error('insert into "notifications"."devices" failed for token secret-token')) }, users)
    const response = await register('a', { kind: 'fcm', token: 'secret-token' })
    expect(response.status).toBe(500)
    // Only the request's own path names the endpoint.
    const { instance: _, ...problem } = await response.json()
    expect(problem).toEqual({ type: 'urn:protobase:problem:internal-error', title: 'Internal Server Error', status: 500, detail: 'The server failed to handle the request' })
  })

  it("keep a user's most recently seen devices up to the cap, and no one else's", async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const memory = memoryDeviceStore()
    const { register } = serve(memory, users)
    const theirs = await (await register('b', web(1000))).json()
    const ids: string[] = []
    for (let n = 0; n <= maxDevicesPerUser; n++) {
      vi.setSystemTime(new Date(Date.UTC(2026, 7, 1, 0, n)))
      ids.push((await (await register('a', web(n))).json()).id)
    }
    const kept = [...memory.devices.values()].filter((device) => device.userId === 'a').map((device) => device.id)
    expect(kept.sort()).toEqual(ids.slice(1).sort())
    expect(memory.devices.has(theirs.id)).toBe(true)
  })

  it('keep tokens, endpoints and keys out of every answer and report', async () => {
    const memory = memoryDeviceStore()
    const failing = { ...memory, remove: () => Promise.reject(new Error('remove failed')) }
    const { register, remove, reported } = serve(failing, users)
    const answers = [
      await register('a', web(1)),
      await register('b', web(1)),
      await register('a', { ...web(2), keys: { p256dh: 'short', auth } }),
      await register('a', { kind: 'apns', token: 'AB'.repeat(32), environment: 'production', appId: 'net.example.app' }),
      await register('a', { kind: 'fcm', token: 'bad/token' }),
    ]
    const own = [...memory.devices.values()][0]!
    answers.push(await remove('b', own.id))
    const seen = [...(await Promise.all(answers.map((answer) => answer.text()))), ...reported.map((error) => String(error))].join('\n')
    for (const secret of [endpoint(1), endpoint(2), p256dh, auth, 'AB'.repeat(32), 'bad/token', 'short']) expect(seen).not.toContain(secret)
  })
})
