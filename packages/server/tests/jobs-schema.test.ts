import { Kysely, sql } from 'kysely'
import { afterEach, describe, expect, it } from 'vitest'
import { defineJob } from '../src/jobs/define-job'
import type { JobDefinition } from '../src/jobs/job-types'
import { startJobs, type JobsRuntime, type StartJobsOptions } from '../src/jobs/runtime'
import { jobsModule, jobsSchemaSql } from '../src/jobs/jobs-module'
import { checkJobsSchema, jobsSchemaMigration } from '../src/jobs/schema'
import { latestModel } from '../src/schema-modules/module-difference'
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
    expect(await jobsModule.read(db)).toBeUndefined()
    // In one transaction, as a project's db:migrate applies its files.
    await db.transaction().execute((trx) => sql.raw(jobsSchemaSql()).execute(trx))
    expect(await jobsModule.read(db)).toEqual(latestModel(jobsModule))
  })

  it('reads functions that are missing as absent unless one is older, and refuses a pg-boss schema newer than or of a version no step records', async () => {
    const db = await jobsDb()
    await sql`comment on function jobs.next_due() is 'Protobase jobs 2'`.execute(db)
    expect(await jobsModule.read(db)).toEqual({ lastStep: 1, replaceables: { functions: 2 } })
    await sql`drop function jobs.enqueue`.execute(db)
    expect(await jobsModule.read(db)).toEqual({ lastStep: 1, replaceables: { functions: 2 } })
    await sql`comment on function jobs.next_due() is 'Protobase jobs 3'`.execute(db)
    expect(await jobsModule.read(db)).toEqual({ lastStep: 1, replaceables: {} })
    // An overload by the same name is not the function the functions' SQL makes.
    await sql.raw(`create function jobs.enqueue(job_name text) returns uuid language sql as 'select null::uuid'; comment on function jobs.enqueue(text) is 'Protobase jobs 3'`).execute(db)
    expect(await jobsModule.read(db)).toEqual({ lastStep: 1, replaceables: {} })
    await sql`update jobs.version set version = 46`.execute(db)
    await expect(jobsModule.read(db)).rejects.toThrow('The jobs schema is at pg-boss schema version 46, newer than the 45 this version of Protobase records: upgrade Protobase')
    await sql`update jobs.version set version = 44`.execute(db)
    await expect(jobsModule.read(db)).rejects.toThrow('The jobs schema is at pg-boss schema version 44, which no step of this version of Protobase records')
  })
})

describe('jobsSchemaMigration and checkJobsSchema, which tests and scripts still call', () => {
  it('write the whole schema on a database without it, and nothing once it is there', async () => {
    const pg = await openSnapshotDb('empty')
    const db = pg.db
    await expect(checkJobsSchema(db)).rejects.toThrow('The jobs schema is missing. Write it as a migration with `protobase migration`')
    const migration = await jobsSchemaMigration(db)
    expect(migration).toContain('CREATE SCHEMA IF NOT EXISTS jobs;')
    await db.transaction().execute((trx) => sql.raw(migration!).execute(trx))
    await checkJobsSchema(db)
    expect(await jobsSchemaMigration(db)).toBeUndefined()
  })

  it("write Protobase's functions again when they are missing, and refuse a pg-boss schema of a newer version", async () => {
    const db = await jobsDb()
    await sql`drop function jobs.enqueue`.execute(db)
    await expect(checkJobsSchema(db)).rejects.toThrow('The jobs schema is behind this version of Protobase')
    const migration = await jobsSchemaMigration(db)
    expect(migration).toMatch(/^create or replace function jobs\.enqueue/)
    expect(migration).not.toContain('CREATE TABLE')
    await sql`update jobs.version set version = 99`.execute(db)
    await expect(checkJobsSchema(db)).rejects.toThrow('pg-boss schema version 99, newer than the 45 this version of Protobase runs')
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
})

