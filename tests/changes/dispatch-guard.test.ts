import { sql, Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { f, resource } from '@protobase/schema'
import { changesMigration, createAdmin, startJobs, subscription, type JobsRuntime, type SubscriptionEvent } from '@protobase/server'
import { createJobsPg } from '../../test-support/jobs'

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

describe('dispatch when event code throws', () => {
  let db: Kysely<any>
  let runtime: JobsRuntime
  const logged: string[] = []
  const errors: unknown[] = []
  const delivered: SubscriptionEvent[] = []

  beforeAll(async () => {
    const pg = await createJobsPg()
    db = new Kysely<any>({ dialect: new PGliteDialect(pg) })
    await pg.exec('create table orders (id integer generated always as identity primary key, notes text)')
    await pg.exec((await changesMigration(db, [orders.toModel()]))!)
    vi.spyOn(console, 'log').mockImplementation((line: string) => void logged.push(line))
    const admin = createAdmin({
      resources: [orders],
      db,
      authenticate: () => ({ user: { id: 'u1', roles: ['admin'] } }),
      subscriptions: [subscription('created', { events: ['orders.created'], run: (event) => void delivered.push(event) })],
    })
    runtime = await startJobs({ db, jobs: admin.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => errors.push(error) })
  })

  afterAll(async () => {
    await runtime?.stop()
    vi.restoreAllMocks()
    await db?.destroy()
    expect(errors).toEqual([])
  })

  const until = (check: () => unknown, timeout = 15_000) => vi.waitFor(check, { timeout, interval: 25 })
  const keys = () => delivered.map((event) => event.data.key).sort()
  const failedJobs = async () =>
    (await sql<{ id: string; name: string; error: string; payload: { change: { key: string } } }>`select id, name, error, payload from jobs.failed`.execute(db)).rows

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
})
