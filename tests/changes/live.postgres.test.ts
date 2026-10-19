import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { f, resource } from '@protobase/schema'
import { readEventStream } from '@protobase/schema/internal'
import { changesMigration, checkChanges, createAdmin, startJobs, type JobsRuntime } from '@protobase/server'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../test-support/postgres-database'

// Workers poll on real timers, which a busy machine stretches.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const orders = resource('orders')
  .table('orders')
  .fields({ id: f.integer().readOnly(), status: f.text() })
  .primaryKey((r) => r.id)
  .live()

type Event = { type: string; cursor: string; changes?: Array<{ resource: string; key: string; operation: string }> }

describe.skipIf(!(await postgresTemplateReady('jobs')))('live updates on Postgres', () => {
  let pg: PostgresDatabase
  let db: Kysely<any>
  let runtime: JobsRuntime
  let admin: ReturnType<typeof createAdmin>
  const errors: unknown[] = []

  beforeAll(async () => {
    pg = await openPostgresDatabase('jobs')
    db = pg.db
    await pg.exec('create table orders (id integer generated always as identity primary key, status text not null)')
    await expect(checkChanges(db, [orders.toModel()])).rejects.toThrow('The changes of orders are not captured')
    await pg.exec((await changesMigration(db, [orders.toModel()]))!)
    admin = createAdmin({ resources: [orders], db, authenticate: () => ({ user: { id: 'u1', roles: ['admin'] } }) })
    runtime = await startJobs({ db, jobs: admin.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => errors.push(error) })
  })

  afterAll(async () => {
    await runtime?.stop()
    await pg?.close()
    expect(errors).toEqual([])
  })

  // Follows the stream until `done` says so with the events so far, then hangs up.
  const follow = async (query: string, done: (events: Event[]) => boolean, whileOpen: () => Promise<unknown> = async () => {}) => {
    const controller = new AbortController()
    const response = await admin.request(`/api/live${query}`, { signal: controller.signal })
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const events: Event[] = []
    await new Promise<void>((resolve, reject) => {
      void readEventStream(response.body!, (data) => {
        events.push(JSON.parse(data) as Event)
        if (events.length === 1) whileOpen().catch(reject)
        if (done(events)) resolve()
      }, controller.signal)
    })
    controller.abort()
    return events
  }
  const keys = (events: Event[]) => events.flatMap((event) => event.changes ?? []).map((change) => `${change.operation}:${change.key}`)

  it('tells an open page of each change, through the API or not, keys only', async () => {
    const events = await follow('', (seen) => keys(seen).length >= 2, async () => {
      expect((await admin.request('/api/v1/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'open' }) })).status).toBe(201)
      await sql`update orders set status = 'paid' where id = 1`.execute(db)
    })
    expect(events[0]).toEqual({ type: 'current', cursor: '0' })
    expect(keys(events)).toEqual(['create:1', 'update:1'])
    expect(JSON.stringify(events)).not.toContain('paid')
  })

  it('catches a page that connects again up on what it missed, and has one whose cursor is gone read everything', async () => {
    const [current] = await follow('', () => true)
    await sql`delete from orders where id = 1`.execute(db)
    await vi.waitFor(async () => expect((await sql<{ count: number }>`select count(*)::int as count from changes.notices`.execute(db)).rows[0]!.count).toBe(3), { timeout: 15_000, interval: 25 })
    // The process's feed reads the table on its own timer: wait until it has read the delete.
    const caught = await vi.waitFor(async () => {
      const [event] = await follow(`?after=${current!.cursor}`, () => true)
      expect(event!.type).toBe('changes')
      return event!
    }, { timeout: 15_000, interval: 200 })
    expect(keys([caught])).toEqual(['delete:1'])
    expect((await follow('?after=1', () => true))[0]!.type).toBe('changes')
    expect((await follow('?after=999', () => true))[0]).toMatchObject({ type: 'resync' })
  })
})
