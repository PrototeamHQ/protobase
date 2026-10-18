import { Kysely, sql } from 'kysely'
import { afterEach, describe, expect, it } from 'vitest'
import { defineJob } from '../src/jobs/define-job'
import type { JobDefinition } from '../src/jobs/job-types'
import { startJobs, type JobsRuntime, type StartJobsOptions } from '../src/jobs/runtime'
import { runId } from '../src/jobs/schedule'
import { openSnapshotDb } from '../../../test-support/sql-snapshot'

let runtime: JobsRuntime | undefined
afterEach(async () => {
  await runtime?.stop()
  runtime = undefined
})

const jobsDb = async () => new Kysely<any>({ dialect: (await openSnapshotDb('jobs')).dialect })

// The workers check for due jobs as they start and then not again within a test, so the queries replay as recorded.
const start = async (db: Kysely<any>, jobs: JobDefinition[], options: Partial<StartJobsOptions> = {}) => {
  runtime = await startJobs({ db, jobs, pollSeconds: 30, shutdownSeconds: 5, onError: (error) => { throw error }, ...options })
}

const restart = async (db: Kysely<any>, jobs: JobDefinition[], options: Partial<StartJobsOptions> = {}) => {
  await runtime?.stop()
  await start(db, jobs, options)
}

const waitingRuns = async (db: Kysely<any>) =>
  (await sql<{ name: string; id: string; start_after: Date }>`
    select name, id, start_after from jobs.job where singleton_key = 'protobase.schedule' and state < 'active' order by name, start_after`.execute(db)).rows

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

})
