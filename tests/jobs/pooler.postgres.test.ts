import { randomBytes } from 'node:crypto'
import { Kysely, PostgresDialect, sql } from 'kysely'
import pg from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { checkJobsSchema, defineJob, jobsSchemaMigration, startJobs, type JobDefinition, type JobsRuntime } from '@protobase/server'
import { connectServer, databaseUrl, poolerUrl, serverReachable } from '../../scripts/test-db/templates'

// Workers poll and retry on real timers, which a busy machine stretches.
vi.setConfig({ testTimeout: 30_000 })

// The job queue on a real Postgres, directly and through PgBouncer in transaction mode as the cloud runs it (no
// LISTEN/NOTIFY, no session state, three server connections), on the runtime that runs Vitest, Node or Bun.
const database = `jobs_run_${randomBytes(4).toString('hex')}`
const reachable = await serverReachable()

const poolerReachable = async () => {
  const pool = new pg.Pool({ connectionString: databaseUrl('postgres', poolerUrl), max: 1, connectionTimeoutMillis: 2_000 })
  const ok = await pool.query('select 1').then(() => true, () => false)
  await pool.end()
  return ok
}

beforeAll(async () => {
  if (!reachable) return
  const admin = connectServer()
  await admin.unsafe(`create database "${database}"`)
  await admin.end()
  // As a project's db:migrate applies the file `protobase migration` writes: one transaction, through postgres.js.
  const db = new Kysely<any>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: databaseUrl(database), max: 1 }) }) })
  const migration = (await jobsSchemaMigration(db))!
  await db.destroy()
  const { default: postgres } = await import('postgres')
  const migrate = postgres(databaseUrl(database), { max: 1, onnotice: () => {} })
  await migrate.begin((tx) => tx.unsafe(migration))
  await migrate.end()
})

afterAll(async () => {
  if (!reachable) return
  const admin = connectServer()
  await admin.unsafe(`drop database if exists "${database}" with (force)`)
  await admin.end()
})

const targets = [
  { name: 'Postgres', url: () => databaseUrl(database), skip: !reachable },
  { name: 'PgBouncer in transaction mode', url: () => databaseUrl(database, poolerUrl), skip: !reachable || !(await poolerReachable()) },
]

describe.each(targets)('jobs on $name', ({ url, skip }) => {
  let db: Kysely<any>
  let runtime: JobsRuntime | undefined
  let errors: unknown[] = []

  beforeAll(() => {
    if (!skip) db = new Kysely<any>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url(), max: 5 }) }) })
  })
  afterEach(async () => {
    await runtime?.stop()
    runtime = undefined
    expect(errors).toEqual([])
    errors = []
  })
  afterAll(async () => {
    await db?.destroy()
  })

  const start = async (jobs: JobDefinition[], pollSeconds = 0.5) => {
    await checkJobsSchema(db)
    runtime = await startJobs({ db, jobs, pollSeconds, onError: (error) => errors.push(error) })
  }
  const until = (check: () => unknown, timeout = 10_000) => vi.waitFor(check, { timeout, interval: 10 })

  it.skipIf(skip)("runs a job committed with the caller's transaction at the next poll, and one enqueued outside at once", async () => {
    const seen: Array<{ n: number; at: number }> = []
    const job = defineJob<{ n: number }>({ name: `count-${randomBytes(3).toString('hex')}`, run: ({ n }) => { seen.push({ n, at: Date.now() }) } })
    await start([job], 30)
    const enqueued = Date.now()
    await job.enqueue(db, { n: 1 })
    await until(() => expect(seen.map(({ n }) => n)).toEqual([1]), 10_000)
    // Woken at once rather than at the next poll, 30 seconds away.
    expect(seen[0]!.at - enqueued).toBeLessThan(5_000)
    await expect(db.transaction().execute(async (trx) => {
      await job.enqueue(trx, { n: 2 })
      throw new Error('the write failed')
    })).rejects.toThrow('the write failed')
    await runtime!.stop()
    runtime = undefined
    await start([job], 0.5)
    await db.transaction().execute((trx) => job.enqueue(trx, { n: 3 }))
    await until(() => expect(seen.map(({ n }) => n)).toEqual([1, 3]))
  })

  it.skipIf(skip)('picks up a job enqueued from SQL on another connection by polling, and retries a failed try', async () => {
    const tries: number[] = []
    const name = `flaky-${randomBytes(3).toString('hex')}`
    const job = defineJob({ name, retryDelay: '1s', run: (_, { job }) => {
      tries.push(job.attempt)
      if (job.attempt === 1) throw new Error('not yet')
    } })
    await start([job])
    const other = new pg.Client({ connectionString: url() })
    await other.connect()
    const { rows } = await other.query('select jobs.enqueue($1) as id', [name])
    await other.end()
    await until(async () => {
      const state = await sql<{ state: string }>`select state from jobs.job where id = ${rows[0].id}`.execute(db)
      expect(state.rows[0]!.state).toBe('completed')
    }, 8_000)
    expect(tries).toEqual([1, 2])
  })

  it.skipIf(skip)('runs the jobs of one group in order, beside other groups, and dedupes by key', async () => {
    const done: Record<string, number[]> = {}
    const ordered = defineJob<{ group: string; index: number }>({
      name: `ordered-${randomBytes(3).toString('hex')}`,
      ordered: true,
      concurrency: 3,
      run: async ({ group, index }) => {
        await new Promise((resolve) => setTimeout(resolve, 5 + ((index * 7) % 20)))
        ;(done[group] ??= []).push(index)
      },
    })
    const keyed = defineJob<{ v: number }>({ name: `keyed-${randomBytes(3).toString('hex')}`, run: () => {} })
    await start([ordered, keyed], 0.5)
    for (let index = 0; index < 4; index++) for (const group of ['a', 'b', 'c']) await ordered.enqueue(db, { group, index }, { group })
    await until(() => expect(done).toEqual({ a: [0, 1, 2, 3], b: [0, 1, 2, 3], c: [0, 1, 2, 3] }), 15_000)
    const [first, second] = await Promise.all([
      keyed.enqueue(db, { v: 1 }, { key: 'k', runAt: new Date(Date.now() + 60_000) }),
      keyed.enqueue(db, { v: 2 }, { key: 'k', runAt: new Date(Date.now() + 60_000) }),
    ])
    expect(second).toBe(first)
  })

  it.skipIf(skip)('lets a running job finish when it stops', async () => {
    let finished = false
    let started = false
    const job = defineJob({ name: `slow-${randomBytes(3).toString('hex')}`, run: async () => {
      started = true
      await new Promise((resolve) => setTimeout(resolve, 300))
      finished = true
    } })
    await start([job])
    await job.enqueue(db)
    await until(() => expect(started).toBe(true))
    await runtime!.stop()
    runtime = undefined
    expect(finished).toBe(true)
  })
})
