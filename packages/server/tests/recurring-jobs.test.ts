import { Kysely, sql } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineJob } from '../src/jobs/define-job'
import type { JobDefinition } from '../src/jobs/job-types'
import { startJobs, type JobsRuntime, type StartJobsOptions } from '../src/jobs/runtime'
import { runId } from '../src/jobs/schedule'
import { createJobsPg } from '../../../test-support/jobs'

// Workers poll and retry on real timers, which a busy machine stretches.
vi.setConfig({ testTimeout: 30_000 })

let runtime: JobsRuntime | undefined
afterEach(async () => {
  await runtime?.stop()
  runtime = undefined
})

const jobsDb = async () => new Kysely<any>({ dialect: new PGliteDialect(await createJobsPg()) })

const start = async (db: Kysely<any>, jobs: JobDefinition[], options: Partial<StartJobsOptions> = {}) => {
  runtime = await startJobs({ db, jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => { throw error }, ...options })
}

const restart = async (db: Kysely<any>, jobs: JobDefinition[], options: Partial<StartJobsOptions> = {}) => {
  await runtime?.stop()
  await start(db, jobs, options)
}

const waitingRuns = async (db: Kysely<any>) =>
  (await sql<{ name: string; id: string; start_after: Date }>`
    select name, id, start_after from jobs.job where singleton_key = 'protobase.schedule' and state < 'active' order by name, start_after`.execute(db)).rows

const until = (check: () => unknown, timeout = 15_000) => vi.waitFor(check, { timeout, interval: 20 })

// The recurring runs that wait for a worker's poll, which a recording cannot replay; still on PGlite, and proven on real
// Postgres by serve.integration's "runs the app's jobs". The rows a schedule writes are in recurring-schedules.test.ts.
describe('recurring jobs', () => {
  it('run at each time, and enqueue the next run as one starts', async () => {
    const db = await jobsDb()
    const ran: number[] = []
    const everySecond = defineJob({ name: 'every-second', schedule: '* * * * * *', run: () => { ran.push(Date.now()) } })
    await start(db, [everySecond])
    await until(() => expect(ran.length).toBeGreaterThanOrEqual(3))
    const runs = await sql<{ id: string; start_after: Date; state: string }>`select id, start_after, state from jobs.job where name = 'every-second'`.execute(db)
    // One job per time: their ids are those of their times.
    for (const run of runs.rows) expect(run.id).toBe(runId('every-second', run.start_after))
    expect(runs.rows.filter((run) => run.state === 'created')).toHaveLength(1)
  })

  it('run a time missed while no worker ran once, then go on from now', async () => {
    const db = await jobsDb()
    const ran: string[] = []
    const job = defineJob({ name: 'catch-up', schedule: '0 * * * *', run: (_, { job }) => { ran.push(job.id) } })
    await start(db, [job], { work: false })
    // The run of the hour that began, enqueued before the app slept through it.
    const missed = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000)
    await sql`insert into jobs.job (id, name, singleton_key, start_after, policy) values (${runId('catch-up', missed)}, 'catch-up', 'protobase.schedule', ${missed}, 'standard')`.execute(db)
    await restart(db, [job])
    await until(() => expect(ran).toEqual([runId('catch-up', missed)]))
    expect((await waitingRuns(db)).map((run) => run.start_after)).toEqual([new Date(missed.getTime() + 3_600_000)])
  })
})
