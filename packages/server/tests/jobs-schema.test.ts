import { Kysely, sql } from 'kysely'
import { afterEach, describe, expect, it } from 'vitest'
import { defineJob } from '../src/jobs/define-job'
import type { JobDefinition } from '../src/jobs/job-types'
import { startJobs, type JobsRuntime, type StartJobsOptions } from '../src/jobs/runtime'
import { checkJobsSchema, jobsSchemaMigration } from '../src/jobs/schema'
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
  it('is checked at startup, written by the migration and never changed by the server', async () => {
    const pg = await openSnapshotDb('empty')
    const db = pg.db
    await expect(checkJobsSchema(db)).rejects.toThrow('The jobs schema is missing. Write it as a migration with `protobase migration`')
    const migration = await jobsSchemaMigration(db)
    expect(migration).toContain('CREATE SCHEMA IF NOT EXISTS jobs;')
    await expect(checkJobsSchema(db)).rejects.toThrow('missing')
    // In one transaction, as a project's db:migrate applies its files.
    await db.transaction().execute((trx) => sql.raw(migration!).execute(trx))
    await checkJobsSchema(db)
    expect(await jobsSchemaMigration(db)).toBeUndefined()
  })

  it("writes Protobase's functions again when they are missing, and refuses a pg-boss schema of another version", async () => {
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

