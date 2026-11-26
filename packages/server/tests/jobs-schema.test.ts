import { Kysely, sql, type RawBuilder } from 'kysely'
import { afterEach, describe, expect, it } from 'vitest'
import { defineJob } from '../src/jobs/define-job'
import type { JobDefinition } from '../src/jobs/job-types'
import { startJobs, type JobsRuntime, type StartJobsOptions } from '../src/jobs/runtime'
import { functionsVersion } from '../src/jobs/functions-sql'
import { readJobData } from '../src/jobs/job-data'
import { jobsModule, jobsSchemaSql } from '../src/jobs/jobs-module'
import { latestModel } from '../src/schema-modules/module-difference'
import { noInput } from '../src/schema-modules/schema-module'
import { openSnapshotDb } from '../../../test-support/sql-snapshot'

// The jobs schema and enqueueing from SQL, with no worker running: what the runtime does with the jobs is in
// jobs.postgres.test.ts.

let runtime: JobsRuntime | undefined
afterEach(async () => {
  await runtime?.stop()
  runtime = undefined
})

const jobsDb = async () => new Kysely<any>({ dialect: (await openSnapshotDb('jobs')).dialect })

const start = async (db: Kysely<any>, jobs: JobDefinition[], options: Partial<StartJobsOptions> = {}) => {
  runtime = await startJobs({ db, jobs, shutdownSeconds: 5, onError: (error) => { throw error }, ...options })
}

type Row = { state: string; data: unknown; singleton_key: string | null }

const row = async (db: Kysely<any>, id: string) => (await sql<Row>`select * from jobs.job where id = ${id}`.execute(db)).rows[0]

describe('the jobs schema', () => {
  it('is read as the step and functions version the database has, once a migration made it', async () => {
    const pg = await openSnapshotDb('empty')
    const db = pg.db
    expect(await jobsModule.read(db, noInput)).toBeUndefined()
    // In one transaction, as a project's db:migrate applies its files.
    await db.transaction().execute((trx) => sql.raw(jobsSchemaSql()).execute(trx))
    expect(await jobsModule.read(db, noInput)).toEqual(latestModel(jobsModule))
  })

  it('reads functions that are missing as absent unless one is older, and refuses a pg-boss schema newer than or of a version no step records', async () => {
    const db = await jobsDb()
    await sql.raw(`comment on function jobs.next_due() is 'Protobase jobs ${functionsVersion - 1}'`).execute(db)
    expect(await jobsModule.read(db, noInput)).toEqual({ lastStep: 1, replaceables: { functions: functionsVersion - 1 } })
    await sql`drop function jobs.enqueue(text, jsonb, timestamptz, text, text, integer, jsonb)`.execute(db)
    expect(await jobsModule.read(db, noInput)).toEqual({ lastStep: 1, replaceables: { functions: functionsVersion - 1 } })
    await sql.raw(`comment on function jobs.next_due() is 'Protobase jobs ${functionsVersion}'`).execute(db)
    expect(await jobsModule.read(db, noInput)).toEqual({ lastStep: 1, replaceables: {} })
    // An overload by the same name is not the function the functions' SQL makes.
    await sql.raw(`create function jobs.enqueue(job_name text) returns uuid language sql as 'select null::uuid'; comment on function jobs.enqueue(text) is 'Protobase jobs ${functionsVersion}'`).execute(db)
    expect(await jobsModule.read(db, noInput)).toEqual({ lastStep: 1, replaceables: {} })
    await sql`update jobs.version set version = 46`.execute(db)
    await expect(jobsModule.read(db, noInput)).rejects.toThrow('The jobs schema is at pg-boss schema version 46, newer than the 45 this version of Protobase records: upgrade Protobase')
    await sql`update jobs.version set version = 44`.execute(db)
    await expect(jobsModule.read(db, noInput)).rejects.toThrow('The jobs schema is at pg-boss schema version 44, which no step of this version of Protobase records')
  })
})

describe('jobs from SQL', () => {
  it('enqueues in the caller\'s transaction with the queue\'s retry settings', async () => {
    const db = await jobsDb()
    const job = defineJob({ name: 'from-sql', maxAttempts: 4, run: () => {} })
    await start(db, [job], { work: false })
    const { rows } = await db.transaction().execute((trx) => sql<{ id: string }>`select jobs.enqueue('from-sql', '{"invoiceId": 1}') as id`.execute(trx))
    // Waiting for a worker, which the runtime's tests run (jobs.postgres.test.ts).
    expect(await row(db, rows[0]!.id)).toMatchObject({ state: 'created', data: { invoiceId: 1 } })
    expect((await sql<{ retry_limit: number }>`select retry_limit from jobs.job where id = ${rows[0]!.id}`.execute(db)).rows[0]!.retry_limit).toBe(3)
  })

  it('creates the queue of a job no worker started yet, and checks the group of an ordered one', async () => {
    const db = await jobsDb()
    const later = new Date(Date.now() + 60_000)
    const { rows } = await sql<{ id: string }>`select jobs.enqueue('not-started', run_at => ${later}) as id`.execute(db)
    expect(rows[0]!.id).toEqual(expect.any(String))
    const ordered = defineJob({ name: 'ordered', ordered: true, run: () => {} })
    await start(db, [ordered], { work: false })
    await expect(sql`select jobs.enqueue('ordered')`.execute(db)).rejects.toThrow('Job "ordered" is ordered: pass its group_key')
    const grouped = await sql<{ id: string }>`select jobs.enqueue('ordered', group_key => 'g1') as id`.execute(db)
    expect((await row(db, grouped.rows[0]!.id))!.singleton_key).toBe('g1')
  })

  it('keeps a payload that holds ~organization as payload, so it never names the organization', async () => {
    const db = await jobsDb()
    const read = async (id: string) => readJobData((await row(db, id))!.data)
    const enqueued = async (query: RawBuilder<unknown>) => ((await query.execute(db)).rows[0] as { id: string }).id
    expect(await read(await enqueued(sql`select jobs.enqueue('x', '{"~organization":"org_b","payload":1}') as id`))).toEqual({ payload: { '~organization': 'org_b', payload: 1 }, organization: undefined })
    expect(await read(await enqueued(sql`select jobs.enqueue('x', '{"~organization":"org_b"}', key => 'k') as id`))).toEqual({ payload: { '~organization': 'org_b' }, organization: undefined })
    // Any other payload is stored as given.
    expect((await row(db, await enqueued(sql`select jobs.enqueue('x', '{"organization":"org_b"}') as id`)))!.data).toEqual({ organization: 'org_b' })
    expect((await row(db, await enqueued(sql`select jobs.enqueue('x', '[1]') as id`)))!.data).toEqual([1])
    expect((await row(db, await enqueued(sql`select jobs.enqueue('x') as id`)))!.data).toBeNull()
  })

  it("stores the runtime's organization beside the payload, and takes only a string or a number as one", async () => {
    const db = await jobsDb()
    const enqueue = async (payload: string | null, organization: string | null) =>
      (await sql<{ id: string }>`select jobs.enqueue('x', ${payload}::jsonb, null, null, null, 0, ${organization}::jsonb) as id`.execute(db)).rows[0]!.id
    expect((await row(db, await enqueue('{"n":1}', '"org_a"')))!.data).toEqual({ '~organization': 'org_a', payload: { n: 1 } })
    expect((await row(db, await enqueue(null, '7')))!.data).toEqual({ '~organization': 7, payload: null })
    expect((await row(db, await enqueue('{"n":1}', 'null')))!.data).toEqual({ n: 1 })
    for (const organization of ['{"id":"org_a"}', '["org_a"]', 'true']) {
      await expect(enqueue('{"n":1}', organization)).rejects.toThrow('Job "x": an organization is a string or a number')
    }
  })
})

