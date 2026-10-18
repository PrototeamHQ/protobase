import { Kysely, sql } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineJob } from '../src/jobs/define-job'
import type { JobDefinition } from '../src/jobs/job-types'
import { FatalJobError } from '../src/jobs/run-job'
import { startJobs, type JobsRuntime, type StartJobsOptions } from '../src/jobs/runtime'
import { createJobsPg } from '../../../test-support/jobs'

// The jobs runtime, whose workers poll and retry on real timers, which a recording cannot replay and a busy machine
// stretches; still on PGlite. The schema and enqueueing from SQL are in jobs-schema.test.ts.
vi.setConfig({ testTimeout: 30_000 })

let runtime: JobsRuntime | undefined
afterEach(async () => {
  await runtime?.stop()
  runtime = undefined
})

const jobsDb = async () => new Kysely<any>({ dialect: new PGliteDialect(await createJobsPg()) })

const start = async (db: Kysely<any>, jobs: JobDefinition[], options: Partial<StartJobsOptions> = {}) => {
  const errors: unknown[] = []
  runtime = await startJobs({ db, jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => errors.push(error), ...options })
  return errors
}

const stop = async () => {
  await runtime!.stop()
  runtime = undefined
}

type Row = { state: string; retry_count: number; data: unknown; output: Record<string, unknown> | null; priority: number; singleton_key: string | null }

const row = async (db: Kysely<any>, id: string) => (await sql<Row>`select * from jobs.job where id = ${id}`.execute(db)).rows[0]

const until = (check: () => unknown, timeout = 10_000) => vi.waitFor(check, { timeout, interval: 20 })

describe('enqueue and run', () => {
  it('runs a job enqueued outside a transaction at once, with its payload checked', async () => {
    const db = await jobsDb()
    const seen: unknown[] = []
    const job = defineJob({ name: 'send-invoice', payload: z.object({ invoiceId: z.number() }), run: (payload, { job }) => { seen.push({ payload, attempt: job.attempt }) } })
    // A poll far away, so only the wake from the enqueue runs it in time.
    await start(db, [job], { pollSeconds: 30 })
    const id = await job.enqueue(db, { invoiceId: 1 })
    await until(() => expect(seen).toEqual([{ payload: { invoiceId: 1 }, attempt: 1 }]), 10_000)
    await until(async () => expect((await row(db, id))!.state).toBe('completed'))
    await expect(job.enqueue(db, { invoiceId: 'x' } as never)).rejects.toThrow('Job "send-invoice" has an invalid payload: invoiceId:')
  })

  it("commits a job with the caller's transaction, or not at all", async () => {
    const db = await jobsDb()
    const seen: number[] = []
    const job = defineJob({ name: 'count', payload: z.object({ n: z.number() }), run: ({ n }) => { seen.push(n) } })
    await start(db, [job])
    await db.transaction().execute((trx) => job.enqueue(trx, { n: 1 }))
    let rolledBack: string | undefined
    await expect(db.transaction().execute(async (trx) => {
      rolledBack = await job.enqueue(trx, { n: 2 })
      throw new Error('the write failed')
    })).rejects.toThrow('the write failed')
    await until(() => expect(seen).toEqual([1]))
    expect(await row(db, rolledBack!)).toBeUndefined()
  })

  it("sends a job's mail with the mailer the jobs started with", async () => {
    const db = await jobsDb()
    const sent: unknown[] = []
    const job = defineJob({ name: 'welcome', run: async (_, { mail }) => { await mail?.send({ to: 'anna@example.com', subject: 'Welcome', text: 'Hello' }) } })
    await start(db, [job], { mailer: { send: async (message) => { sent.push(message) } } })
    await job.enqueue(db)
    await until(() => expect(sent).toEqual([{ to: 'anna@example.com', subject: 'Welcome', text: 'Hello' }]))
  })

  it('refuses a job that is not among the jobs started', async () => {
    const db = await jobsDb()
    await start(db, [defineJob({ name: 'a', run: () => {} })])
    await expect(defineJob({ name: 'b', run: () => {} }).enqueue(db)).rejects.toThrow('Job "b" is not among the app\'s jobs')
  })
})

describe('keys', () => {
  it('keeps one waiting job per key: dedupe keeps it, replace takes the new payload', async () => {
    const db = await jobsDb()
    const job = defineJob({ name: 'refresh', payload: z.object({ v: z.number() }), run: () => {} })
    await start(db, [job], { work: false })
    const first = await job.enqueue(db, { v: 1 }, { key: 'customer:7' })
    expect(await job.enqueue(db, { v: 2 }, { key: 'customer:7' })).toBe(first)
    expect((await row(db, first))!.data).toEqual({ v: 1 })
    expect(await job.enqueue(db, { v: 3 }, { key: 'customer:7', mode: 'replace', priority: 5 })).toBe(first)
    expect(await row(db, first)).toMatchObject({ data: { v: 3 }, priority: 5 })
    expect(await job.enqueue(db, { v: 4 }, { key: 'customer:8' })).not.toBe(first)
    const fromSql = await sql<{ id: string }>`select jobs.enqueue('refresh', '{"v": 5}', key => 'customer:7') as id`.execute(db)
    expect(fromSql.rows[0]!.id).toBe(first)
  })

  it('enqueues a new job once the waiting one runs', async () => {
    const db = await jobsDb()
    let release!: () => void
    const running = new Promise<void>((resolve) => { release = resolve })
    const started: number[] = []
    const job = defineJob({ name: 'refresh', payload: z.object({ v: z.number() }), run: async ({ v }) => { started.push(v); if (v === 1) await running } })
    await start(db, [job])
    const first = await job.enqueue(db, { v: 1 }, { key: 'k' })
    await until(() => expect(started).toEqual([1]))
    const second = await job.enqueue(db, { v: 2 }, { key: 'k' })
    expect(second).not.toBe(first)
    release()
    await until(() => expect(started).toEqual([1, 2]))
  })
})

describe('failures', () => {
  it('retries a failed try after a backoff, then completes', async () => {
    const db = await jobsDb()
    const tries: number[] = []
    const job = defineJob({ name: 'flaky', retryDelay: '1s', run: (_, { job }) => {
      tries.push(Date.now())
      if (job.attempt === 1) throw new Error('SMTP down')
    } })
    await start(db, [job])
    const id = await job.enqueue(db)
    await until(async () => expect((await row(db, id))!.state).toBe('completed'), 8_000)
    expect(tries).toHaveLength(2)
    expect(tries[1]! - tries[0]!).toBeGreaterThanOrEqual(900)
  })

  it('keeps a job as failed with its last error once its attempts run out', async () => {
    const db = await jobsDb()
    let tries = 0
    const job = defineJob({ name: 'broken', maxAttempts: 2, retryDelay: '1s', run: () => { tries += 1; throw new Error(`try ${tries}`) } })
    await start(db, [job])
    const id = await job.enqueue(db)
    await until(async () => expect(await row(db, id)).toMatchObject({ state: 'failed', retry_count: 1, output: { message: 'try 2' } }), 8_000)
    expect(tries).toBe(2)
  })

  it('fails a job for good on a FatalJobError', async () => {
    const db = await jobsDb()
    const run = vi.fn(() => { throw new FatalJobError('410 Gone') })
    const job = defineJob({ name: 'deliver', maxAttempts: 5, run })
    await start(db, [job])
    const id = await job.enqueue(db)
    await until(async () => expect(await row(db, id)).toMatchObject({ state: 'failed', retry_count: 0, output: { message: '410 Gone' } }))
    expect(run).toHaveBeenCalledTimes(1)
  })
})

describe('order', () => {
  it('runs higher priorities first', async () => {
    const db = await jobsDb()
    const order: string[] = []
    const job = defineJob({ name: 'ranked', payload: z.object({ label: z.string() }), run: ({ label }) => { order.push(label) } })
    await start(db, [job], { work: false })
    await job.enqueue(db, { label: 'low' }, { priority: -1 })
    await job.enqueue(db, { label: 'normal' })
    await job.enqueue(db, { label: 'urgent' }, { priority: 10 })
    await job.enqueue(db, { label: 'normal too' })
    await stop()
    await start(db, [job])
    await until(() => expect(order).toEqual(['urgent', 'normal', 'normal too', 'low']))
  })

  it('runs the jobs of one group one at a time, in order, beside other groups', async () => {
    const db = await jobsDb()
    const done: Record<string, number[]> = {}
    const running = new Set<string>()
    let overlaps = 0
    const job = defineJob({
      name: 'ordered',
      ordered: true,
      concurrency: 3,
      payload: z.object({ group: z.string(), index: z.number() }),
      run: async ({ group, index }) => {
        if (running.has(group)) overlaps += 1
        running.add(group)
        await new Promise((resolve) => setTimeout(resolve, 5 + ((index * 7) % 20)))
        running.delete(group)
        ;(done[group] ??= []).push(index)
      },
    })
    await start(db, [job], { work: false })
    for (let index = 0; index < 4; index++) for (const group of ['a', 'b', 'c']) await job.enqueue(db, { group, index }, { group })
    await stop()
    await start(db, [job], { pollSeconds: 0.5 })
    await until(() => expect(done).toEqual({ a: [0, 1, 2, 3], b: [0, 1, 2, 3], c: [0, 1, 2, 3] }), 10_000)
    expect(overlaps).toBe(0)
  })

  it('holds a group back behind a job that is retrying', async () => {
    const db = await jobsDb()
    const done: number[] = []
    const job = defineJob({
      name: 'ordered',
      ordered: true,
      retryDelay: '1s',
      payload: z.object({ index: z.number() }),
      run: ({ index }, { job }) => {
        if (index === 0 && job.attempt === 1) throw new Error('not yet')
        done.push(index)
      },
    })
    await start(db, [job])
    await job.enqueue(db, { index: 0 }, { group: 'g' })
    await job.enqueue(db, { index: 1 }, { group: 'g' })
    await until(() => expect(done).toEqual([0, 1]), 8_000)
  })

  it('runs the jobs of one group enqueued in one transaction in that order, from the app and from SQL', async () => {
    const db = await jobsDb()
    const done: number[] = []
    const job = defineJob({ name: 'ordered', ordered: true, payload: z.object({ index: z.number() }), run: ({ index }) => { done.push(index) } })
    await start(db, [job])
    const indexes = Array.from({ length: 12 }, (_, index) => index)
    await db.transaction().execute(async (trx) => {
      for (const index of indexes) {
        if (index % 3 === 0) await sql`select jobs.enqueue('ordered', ${JSON.stringify({ index })}::jsonb, group_key => 'g')`.execute(trx)
        else await job.enqueue(trx, { index }, { group: 'g' })
      }
    })
    await until(() => expect(done).toEqual(indexes), 10_000)
  })
})

describe('the runtime', () => {
  it('lets a running job finish when it stops', async () => {
    const db = await jobsDb()
    let started = false
    const job = defineJob({ name: 'slow', run: async () => { started = true; await new Promise((resolve) => setTimeout(resolve, 300)) } })
    await start(db, [job])
    const id = await job.enqueue(db)
    await until(() => expect(started).toBe(true))
    await stop()
    expect((await row(db, id))!.state).toBe('completed')
  })

  it('fails a job still running when the grace period ends, to be retried', async () => {
    const db = await jobsDb()
    let started = false
    const job = defineJob({ name: 'stuck', run: async (_, { signal }) => {
      started = true
      await new Promise((resolve) => signal.addEventListener('abort', resolve))
    } })
    await start(db, [job], { shutdownSeconds: 1 })
    const id = await job.enqueue(db)
    await until(() => expect(started).toBe(true))
    await stop()
    expect(await row(db, id)).toMatchObject({ state: 'retry', output: { value: 'pg-boss shut down while active' } })
  })

  it('takes a reloaded definition for the next job, and new and removed jobs', async () => {
    const db = await jobsDb()
    const seen: string[] = []
    const first = defineJob({ name: 'reloaded', run: () => { seen.push('old') } })
    await start(db, [first])
    const second = defineJob({ name: 'reloaded', run: () => { seen.push('new') } })
    const added = defineJob({ name: 'added', run: () => { seen.push('added') } })
    await runtime!.update([second, added])
    await second.enqueue(db)
    await added.enqueue(db)
    await until(() => expect(seen.sort()).toEqual(['added', 'new']))
    await runtime!.update([added])
    await expect(second.enqueue(db)).rejects.toThrow('is not among the app\'s jobs')
  })

  it('refuses a job that changed between ordered and unordered', async () => {
    const db = await jobsDb()
    await start(db, [defineJob({ name: 'switched', run: () => {} })], { work: false })
    await stop()
    await expect(start(db, [defineJob({ name: 'switched', ordered: true, run: () => {} })])).rejects.toThrow(
      'Job "switched" became ordered, but its queue keeps the old order',
    )
    runtime = undefined
  })

  it('updates the queue when retry settings change', async () => {
    const db = await jobsDb()
    await start(db, [defineJob({ name: 'tuned', run: () => {} })], { work: false })
    await stop()
    await start(db, [defineJob({ name: 'tuned', maxAttempts: 3, timeout: '1 minute', run: () => {} })], { work: false })
    const { rows } = await sql<{ retry_limit: number; expire_seconds: number }>`select retry_limit, expire_seconds from jobs.queue where name = 'tuned'`.execute(db)
    expect(rows[0]).toEqual({ retry_limit: 2, expire_seconds: 60 })
  })
})
