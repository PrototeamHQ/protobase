import { Kysely, sql } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineJob } from '../src/jobs/define-job'
import type { JobDefinition } from '../src/jobs/job-types'
import { startJobs, type JobsRuntime, type StartJobsOptions } from '../src/jobs/runtime'
import { createJobsPg } from '../../../test-support/jobs'

// Workers poll and retry on real timers, which a busy machine stretches.
vi.setConfig({ testTimeout: 30_000 })

let runtime: JobsRuntime | undefined
afterEach(async () => {
  await runtime?.stop()
  runtime = undefined
})

const jobsDb = async () => new Kysely<any>({ dialect: new PGliteDialect(await createJobsPg()) })

// A poll far away, so only a drain or an enqueue in this process starts a job.
const start = async (db: Kysely<any>, jobs: JobDefinition[], options: Partial<StartJobsOptions> = {}) => {
  runtime = await startJobs({ db, jobs, pollSeconds: 30, shutdownSeconds: 5, onError: (error) => { throw error }, ...options })
}

const fromSql = (db: Kysely<any>, name: string, extra = sql``) => sql`select jobs.enqueue(${name}${extra})`.execute(db)

const nextDue = async (db: Kysely<any>) => (await sql<{ due: Date | null }>`select jobs.next_due() as due`.execute(db)).rows[0]!.due

describe('jobs.next_due()', () => {
  it('is null with nothing waiting, then the first start of a waiting job', async () => {
    const db = await jobsDb()
    expect(await nextDue(db)).toBeNull()
    await start(db, [defineJob({ name: 'later', run: () => {} })], { work: false })
    const [soon, later] = [new Date('2030-01-01T10:00:00Z'), new Date('2030-01-02T10:00:00Z')]
    await fromSql(db, 'later', sql`, run_at => ${later}`)
    await fromSql(db, 'later', sql`, run_at => ${soon}`)
    expect(await nextDue(db)).toEqual(soon)
  })

  it('leaves out the group a failed job holds back, and counts a running job from its timeout', async () => {
    const db = await jobsDb()
    await start(db, [defineJob({ name: 'ordered', ordered: true, run: () => {} }), defineJob({ name: 'slow', timeout: '1 minute', run: () => {} })], { work: false })
    await fromSql(db, 'ordered', sql`, group_key => 'g'`)
    await sql`update jobs.job set state = 'failed' where name = 'ordered'`.execute(db)
    await fromSql(db, 'ordered', sql`, group_key => 'g'`)
    expect(await nextDue(db)).toBeNull()
    await fromSql(db, 'slow')
    await sql`update jobs.job set state = 'active', started_on = '2030-01-01T10:00:00Z' where name = 'slow'`.execute(db)
    expect(await nextDue(db)).toEqual(new Date('2030-01-01T10:01:00Z'))
  })
})

describe('drain', () => {
  it('runs every due job, from any source, and says when the next one is due', async () => {
    const db = await jobsDb()
    const ran: number[] = []
    const job = defineJob<{ n: number }>({ name: 'count', concurrency: 2, run: ({ n }) => { ran.push(n) } })
    await start(db, [job])
    for (let n = 1; n <= 5; n++) await fromSql(db, 'count', sql`, ${JSON.stringify({ n })}::jsonb`)
    const later = new Date('2030-01-01T10:00:00Z')
    await fromSql(db, 'count', sql`, '{"n": 6}', run_at => ${later}`)
    expect(await runtime!.drain(20)).toEqual({ drained: true, remaining: 0, nextDue: later })
    expect(ran.sort()).toEqual([1, 2, 3, 4, 5])
  })

  it('stops when its time is up, with what is left', async () => {
    const db = await jobsDb()
    const job = defineJob({ name: 'slow', run: () => new Promise((resolve) => setTimeout(resolve, 3_000)) })
    await start(db, [job])
    await fromSql(db, 'slow')
    const result = await runtime!.drain(0.5)
    expect(result).toMatchObject({ drained: false, remaining: 1 })
  })

  it('needs a process that runs jobs', async () => {
    const db = await jobsDb()
    await start(db, [defineJob({ name: 'elsewhere', run: () => {} })], { work: false })
    await expect(runtime!.drain(1)).rejects.toThrow('This process runs no jobs, so it cannot drain them')
  })
})
