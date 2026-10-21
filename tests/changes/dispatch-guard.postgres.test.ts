import { sql, Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { f, resource } from '@protobase/schema'
import { changesMigration, createAdmin, startJobs, subscription, type JobsRuntime, type SubscriptionEvent } from '@protobase/server'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../test-support/postgres-database'

// Workers poll and retry on real timers, which a busy machine stretches.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

// Until the "fix", a `match` that expects notes on every order, as app code may.
let fixed = false

const orders = resource('orders')
  .table('orders')
  .fields({ id: f.integer().readOnly(), notes: f.text().optional() })
  .primaryKey((r) => r.id)
  .events((e) => [
    ...e.crud(),
    e.created('rush', { match: ({ after }) => (fixed ? String(after?.notes ?? '') : (after!.notes as string)).includes('RUSH') }),
  ])

// Until the "fix", a presence rule on a sensitive field, which a captured change does not hold.
let keysFixed = false

const keysResource = resource('keys')
  .table('keys')
  .fields({ id: f.integer().readOnly(), name: f.text(), api_secret: f.text().optional().sensitive() })
  .primaryKey((r) => r.id)
  .access({ read: (ctx, record) => keysFixed || record!.api_secret == null || (ctx.user?.roles ?? []).includes('admin') })
  .events((e) => [...e.crud(), e.created('made')])

describe.skipIf(!(await postgresTemplateReady('jobs')))('dispatch when event code throws', () => {
  let pg: PostgresDatabase
  let db: Kysely<any>
  let runtime: JobsRuntime
  const logged: string[] = []
  const errors: unknown[] = []
  const delivered: SubscriptionEvent[] = []
  const keysAll: SubscriptionEvent[] = []
  const keysViewer: SubscriptionEvent[] = []

  beforeAll(async () => {
    pg = await openPostgresDatabase('jobs')
    db = pg.db
    await pg.exec('create table orders (id integer generated always as identity primary key, notes text)')
    await pg.exec('create table keys (id integer generated always as identity primary key, name text not null, api_secret text)')
    await pg.exec((await changesMigration(db, [orders.toModel(), keysResource.toModel()]))!)
    vi.spyOn(console, 'log').mockImplementation((line: string) => void logged.push(line))
    const admin = createAdmin({
      resources: [orders, keysResource],
      db,
      authenticate: () => ({ user: { id: 'u1', roles: ['admin'] } }),
      subscriptions: [
        subscription('created', { events: ['orders.created'], run: (event) => void delivered.push(event) }),
        subscription('keys_viewer', { events: ['keys.created', 'keys.made'], as: { roles: ['viewer'] }, run: (event) => void keysViewer.push(event) }),
        subscription('keys_all', { events: ['keys.created'], run: (event) => void keysAll.push(event) }),
      ],
    })
    runtime = await startJobs({ db, jobs: admin.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => errors.push(error) })
  })

  afterAll(async () => {
    await runtime?.stop()
    vi.restoreAllMocks()
    await pg?.close()
    expect(errors).toEqual([])
  })

  const until = (check: () => unknown, timeout = 15_000) => vi.waitFor(check, { timeout, interval: 25 })
  const keys = () => delivered.map((event) => event.data.key).sort()
  const failedJobs = async () =>
    (await sql<{ id: string; name: string; error: string; payload: { change: { key: string }; subscription?: string } }>`select id, name, error, payload from jobs.failed`.execute(db)).rows
  const failedAt = async (id: string) => (await sql<{ failed_at: Date | null }>`select completed_on as failed_at from jobs.job where id = ${id} and state = 'failed'`.execute(db)).rows[0]?.failed_at
  const retry = async (id: string) => sql`update jobs.failed set retry = true where id = ${id}`.execute(db)
  const keysViewerFailure = {
    id: expect.any(String),
    name: 'webhooks.dispatch-change',
    error: expect.stringContaining('The access check of subscription "keys_viewer" on keys 1 threw: a subscription\'s access check cannot tell whether the sensitive field "api_secret" is set'),
    payload: { change: expect.objectContaining({ resource: 'keys', key: '1' }), subscription: 'keys_viewer' },
  }

  it('keeps a change whose match throws as a failed job, and delivers the ordinary order after it', async () => {
    await sql`insert into orders (notes) values ('first')`.execute(db)
    await until(() => expect(keys()).toEqual(['1']))
    await sql`insert into orders (notes) values (null)`.execute(db)
    await sql`insert into orders (notes) values ('third')`.execute(db)
    await until(() => expect(keys()).toEqual(['1', '3']))
    await until(async () =>
      expect(await failedJobs()).toEqual([
        {
          id: expect.any(String),
          name: 'webhooks.dispatch-change',
          error: expect.stringMatching(/^Event orders\.rush on orders 2 threw: /),
          payload: { change: expect.objectContaining({ resource: 'orders', key: '2' }) },
        },
      ]),
    )
    const outbox = await sql<{ count: string }>`select count(*)::text as count from changes.outbox`.execute(db)
    expect(outbox.rows[0]!.count).toBe('0')
    expect(logged.some((line) => line.startsWith('events kept as failed (webhooks.dispatch-change): Event orders.rush on orders 2 threw: '))).toBe(true)
  })

  it('delivers the kept change once its job is retried after the fix', async () => {
    fixed = true
    const [failed] = await failedJobs()
    await sql`update jobs.failed set retry = true where id = ${failed!.id}`.execute(db)
    await until(() => expect(keys()).toEqual(['1', '2', '3']))
    expect(delivered.find((event) => event.data.key === '2')).toMatchObject({ id: expect.stringMatching(/^evt_\d+_created$/), type: 'orders.created' })
    await until(async () => expect(await failedJobs()).toEqual([]))
  })

  it('keeps a change whose access check throws as failed for that subscription only, and delivers it to the others', async () => {
    await sql`insert into keys (name, api_secret) values ('api', 'secret')`.execute(db)
    await until(() => expect(keysAll.map((event) => event.data.key)).toEqual(['1']))
    await until(async () => expect(await failedJobs()).toEqual([keysViewerFailure]))
    expect(keysAll[0]!.data.after).toEqual({ id: 1, name: 'api' })
    expect(keysViewer).toEqual([])
  })

  it('keeps it failed, and enqueues nothing, when retried before the fix', async () => {
    const [failed] = await failedJobs()
    const before = await failedAt(failed!.id)
    await retry(failed!.id)
    await until(async () => expect((await failedAt(failed!.id))?.getTime()).toBeGreaterThan(before!.getTime()))
    expect(await failedJobs()).toEqual([{ ...keysViewerFailure, id: failed!.id }])
    expect(keysViewer).toEqual([])
    expect(keysAll).toHaveLength(1)
  })

  it('keeps a failed subscription of its own when a change kept whole is retried', async () => {
    // A change kept before failures were per subscription has none in its payload: its retry routes it to every one.
    const [failed] = await failedJobs()
    await sql`update jobs.job set data = data - 'subscription' where id = ${failed!.id}`.execute(db)
    await retry(failed!.id)
    await until(() => expect(keysAll).toHaveLength(2))
    await until(async () => expect(await failedJobs()).toEqual([keysViewerFailure]))
    expect((await failedJobs())[0]!.id).not.toBe(failed!.id)
    expect(keysViewer).toEqual([])
  })

  it("delivers the kept change to that subscription alone once its job is retried after the fix", async () => {
    keysFixed = true
    const [failed] = await failedJobs()
    await retry(failed!.id)
    await until(() => expect(keysViewer.map((event) => event.type).sort()).toEqual(['keys.created', 'keys.made']))
    await until(async () => expect(await failedJobs()).toEqual([]))
    expect(keysViewer.map((event) => event.data.after)).toEqual([{ id: 1, name: 'api' }, { id: 1, name: 'api' }])
    expect(keysAll).toHaveLength(2)
  })
})
