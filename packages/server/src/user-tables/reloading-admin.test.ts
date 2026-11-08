import { createAdaptorServer } from '@hono/node-server'
import { Hono } from 'hono'
import type { AddressInfo } from 'node:net'
import { describe, expect, it, vi } from 'vitest'
import { notFound } from '../problem'
import { createErrorHandler } from '../error-handler'
import type { Admin, AdminEnv } from '../types'
import { reloadingAdmin } from './reloading-admin'
import type { UserTables } from './user-table-resources'

const noTables: UserTables = { resources: [], views: [], definitions: [], problems: [] }

// An admin that knows the resources named, answers `/meta` with its name, and echoes a JSON body back.
const fakeAdmin = (name: string, known: string[]) => {
  const app = new Hono<AdminEnv>()
  app.onError(createErrorHandler())
  app.get('/api/meta', (c) => c.json({ name }))
  app.all('/api/v1/:resource', async (c) => {
    if (!known.includes(c.req.param('resource'))) throw notFound(`There is no resource "${c.req.param('resource')}"`)
    return c.json({ name, body: c.req.method === 'POST' ? await c.req.json() : undefined })
  })
  return Object.assign(app, { jobs: [], startRealtimePrune: () => ({ stop: async () => {} }), decryptField: async () => undefined, metaPath: '/api/meta' }) as unknown as Admin
}

const setup = (versions: string[], build = (tables: UserTables) => fakeAdmin(`built ${tables === noTables}`, ['orders', 'notes'])) => {
  let time = 0
  const readVersion = vi.fn(async () => versions.shift() ?? '2')
  const readTables = vi.fn(async () => noTables)
  const report = vi.fn()
  const admin = reloadingAdmin({ first: fakeAdmin('first', ['orders']), version: '1', readVersion, readTables, build: vi.fn(build), report, now: () => time })
  return { admin, readVersion, report, wait: (ms: number) => void (time += ms) }
}

const nameOf = async (response: Response) => ((await response.json()) as { name: string }).name

describe('reloadingAdmin', () => {
  it('reads the version for /meta at once and answers it with the admin built anew', async () => {
    const { admin, readVersion } = setup(['2'])
    expect(await nameOf(await admin.request('/api/meta'))).toBe('built true')
    expect(readVersion).toHaveBeenCalledTimes(1)
  })

  it('answers other requests within the second without reading the version', async () => {
    const { admin, readVersion } = setup([])
    expect(await nameOf(await admin.request('/api/v1/orders'))).toBe('first')
    expect(readVersion).not.toHaveBeenCalled()
  })

  it('answers a request naming a resource it did not know with the admin built anew, its JSON body too', async () => {
    const { admin, readVersion } = setup(['2'])
    const answer = await admin.request('/api/v1/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'First' }) })
    expect(answer.status).toBe(200)
    expect(await answer.json()).toEqual({ name: 'built true', body: { title: 'First' } })
    expect(readVersion).toHaveBeenCalledTimes(1)
  })

  it('keeps the method of a JSON request on Node, as dev and serve hand it over', async () => {
    const { admin } = setup([])
    // The adapter without its global Request: the request it hands the app is its own class, not the platform's.
    const server = createAdaptorServer({ fetch: admin.fetch, overrideGlobalObjects: false }).listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    const { port } = server.address() as AddressInfo
    const answer = await fetch(`http://localhost:${port}/api/v1/orders`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'First' }) })
    await new Promise((resolve) => server.close(resolve))
    expect(await answer.json()).toEqual({ name: 'first', body: { title: 'First' } })
  })

  it('answers not found when the version did not move', async () => {
    const { admin } = setup(['1'])
    expect((await admin.request('/api/v1/notes')).status).toBe(404)
  })

  it('reports an admin that does not build and keeps serving the one before', async () => {
    const { admin, report } = setup(['2'], () => {
      throw new Error('The view of "notes" names "due", which is not a field of notes')
    })
    expect(await nameOf(await admin.request('/api/meta'))).toBe('first')
    expect(report.mock.calls[0]![0].cause.message).toMatch('"notes"')
    expect(await nameOf(await admin.request('/api/v1/orders'))).toBe('first')
  })

  it('answers a failed version read as an error, not with the admin it has', async () => {
    const { admin, readVersion, report } = setup([])
    readVersion.mockRejectedValueOnce(new Error('connection refused'))
    const answer = await admin.request('/api/meta')
    expect(answer.status).toBe(500)
    expect(report).toHaveBeenCalled()
  })

  it('finishes a request in flight on the admin it started with', async () => {
    let release = () => {}
    const slow = fakeAdmin('first', ['orders'])
    slow.get('/api/slow', async (c) => {
      await new Promise<void>((resolve) => (release = resolve))
      return c.json({ name: 'first' })
    })
    const admin = reloadingAdmin({ first: slow, version: '1', readVersion: async () => '2', readTables: async () => noTables, build: () => fakeAdmin('built', ['orders']) })
    const inFlight = admin.request('/api/slow')
    expect(await nameOf(await admin.request('/api/meta'))).toBe('built')
    release()
    expect(await nameOf(await inFlight)).toBe('first')
  })
})

describe('reloadingAdmin after a write to a definition', () => {
  // An admin that answers every request with `status`.
  const write = (status = 200) => {
    const first = new Hono<AdminEnv>()
    first.all('*', (c) => c.json({}, status as 200))
    const shaped = Object.assign(first, { jobs: [], startRealtimePrune: () => ({ stop: async () => {} }), decryptField: async () => undefined, metaPath: '/api/meta' }) as unknown as Admin
    const readVersion = vi.fn(async () => '1')
    const admin = reloadingAdmin({ first: shaped, version: '1', readVersion, readTables: async () => noTables, build: () => shaped, now: () => 0 })
    return { admin, readVersion }
  }

  it.each(['/api/v1/user_tables', '/api/v1/user_table_fields', '/api/v1:batchWrite'])('reads the version at once once %s succeeded', async (path) => {
    const { admin, readVersion } = write()
    expect((await admin.request(path, { method: 'POST' })).status).toBe(200)
    expect(readVersion).toHaveBeenCalledTimes(1)
  })

  it('reads nothing after a refused write, a read or a write elsewhere', async () => {
    const refused = write(400)
    expect((await refused.admin.request('/api/v1/user_tables', { method: 'POST' })).status).toBe(400)
    expect(refused.readVersion).not.toHaveBeenCalled()
    const other = write()
    await other.admin.request('/api/v1/orders', { method: 'POST' })
    await other.admin.request('/api/v1/user_tables')
    expect(other.readVersion).not.toHaveBeenCalled()
  })
})
