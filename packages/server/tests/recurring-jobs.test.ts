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

describe('recurring jobs', () => {
  // A clock well before the next run, so it stays waiting while the test looks at it.
  const now = () => new Date('2030-01-07T06:00:00Z')
  const nightly = (schedule = '0 7 * * *') => defineJob({ name: 'nightly', schedule, run: () => {} })

  it('wait as their next run, enqueued once however many workers start', async () => {
    const db = await jobsDb()
    await start(db, [nightly()], { now })
    await restart(db, [nightly()], { now })
    const at = new Date('2030-01-07T07:00:00Z')
    expect(await waitingRuns(db)).toEqual([{ name: 'nightly', id: runId('nightly', at), start_after: at }])
    expect(await runtime!.nextDue()).toEqual(at)
  })

  it('follow a changed schedule, and stop waiting once the schedule or the job is gone', async () => {
    const db = await jobsDb()
    const weekly = defineJob({ name: 'weekly', schedule: '0 6 * * 1', timezone: 'Europe/Amsterdam', run: () => {} })
    await start(db, [nightly(), weekly], { now })
    await restart(db, [nightly('0 8 * * *'), weekly], { now })
    expect((await waitingRuns(db)).map(({ name, start_after }) => [name, start_after.toISOString()])).toEqual([
      ['nightly', '2030-01-07T08:00:00.000Z'],
      ['weekly', '2030-01-14T05:00:00.000Z'],
    ])
    await restart(db, [defineJob({ name: 'nightly', run: () => {} })], { now })
    expect(await waitingRuns(db)).toEqual([])
  })

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
