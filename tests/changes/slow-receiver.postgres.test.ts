import { createServer, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { f, resource } from '@protobase/schema'
import { readEventStream } from '@protobase/schema/internal'
import { captureSchemaSql, createAdmin, startJobs, subscription, type JobsRuntime } from '@protobase/server'
import { openPostgresDatabase, postgresTemplateReady, statementTimeoutMs, type PostgresDatabase } from '../../test-support/postgres-database'

// Workers poll on real timers, which a busy machine stretches.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const orders = resource('orders')
  .table('orders')
  .fields({ id: f.integer().readOnly(), status: f.text() })
  .primaryKey((r) => r.id)
  .events((e) => e.crud())
  .live()

type Event = { type: string; changes?: Array<{ key: string; operation: string }> }

// A receiver that answers nobody until `answer`, keeping whether each request is still open.
const startHangingReceiver = async () => {
  const held: Array<{ response: ServerResponse; open: boolean }> = []
  const server = createServer((request, response) => {
    const entry = { response, open: true }
    response.on('close', () => void (entry.open = false))
    request.resume()
    held.push(entry)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}/hook`,
    held,
    answer: () => held.forEach(({ response }) => response.end('ok')),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

describe.skipIf(!(await postgresTemplateReady('jobs')))('a slow webhook receiver on Postgres', () => {
  let pg: PostgresDatabase
  let db: Kysely<any>
  let runtime: JobsRuntime
  let admin: ReturnType<typeof createAdmin>
  let receiver: Awaited<ReturnType<typeof startHangingReceiver>>
  const logged: string[] = []
  const errors: unknown[] = []

  beforeAll(async () => {
    pg = await openPostgresDatabase('jobs')
    db = pg.db
    await pg.exec('create table orders (id integer generated always as identity primary key, status text not null)')
    await pg.exec(captureSchemaSql([orders.toModel()]))
    receiver = await startHangingReceiver()
    vi.spyOn(console, 'log').mockImplementation((line: string) => void logged.push(line))
    admin = createAdmin({
      resources: [orders],
      db,
      authenticate: () => ({ user: { id: 'u1', roles: ['admin'] } }),
      subscriptions: [subscription('hook', { events: ['orders.created'], url: receiver.url })],
      options: { statementTimeoutMs },
    })
    runtime = await startJobs({ db, jobs: admin.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => errors.push(error) })
  })

  afterAll(async () => {
    await runtime?.stop()
    vi.restoreAllMocks()
    await receiver?.close()
    await pg?.close()
    expect(errors).toEqual([])
  })

  it('tells an open page of a write while the webhook of that write is still waiting on its receiver', async () => {
    const controller = new AbortController()
    const response = await admin.request('/api/live', { signal: controller.signal })
    const events: Event[] = []
    await new Promise<void>((resolve, reject) => {
      void readEventStream(response.body!, (data) => {
        events.push(JSON.parse(data) as Event)
        if (events.length === 1) {
          const body = JSON.stringify({ status: 'open' })
          Promise.resolve(admin.request('/api/v1/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body })).catch(reject)
        }
        if (events.some((event) => event.changes?.some((change) => change.operation === 'create'))) resolve()
      }, controller.signal)
    })
    controller.abort()
    // A dispatch that tried the receiver first would have given up on it, after 15 s, before telling the page.
    expect(receiver.held.filter(({ open }) => !open)).toEqual([])
    await vi.waitFor(() => expect(receiver.held).toHaveLength(1), { timeout: 15_000, interval: 25 })
    receiver.answer()
    await vi.waitFor(() => expect(logged.some((line) => /^webhook hook orders\.created \S+ delivered \(200\)$/.test(line))).toBe(true), { timeout: 15_000, interval: 25 })
  })
})
