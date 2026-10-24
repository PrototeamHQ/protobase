import { sql, type RawBuilder } from 'kysely'
import type { Db } from '@protobase/query'
import type { JobContext } from './job-types'
import { jobsSchema } from './schema'

/** Thrown when a try no longer holds its job: its time ran out and the job was failed, retried or taken by another try. */
export class StaleJobError extends Error {
  override name = 'StaleJobError'
  constructor(name: string) {
    super(`Job "${name}" is no longer this try's: its time ran out`)
  }
}

type Try = JobContext['job']

// The job's row while this try holds it: still active, and taken at this try's time, which every fetch sets anew. The
// time is compared within a millisecond, as the driver gives it in milliseconds and Postgres keeps microseconds.
const held = (job: Try) =>
  sql`name = ${job.name} and id = ${job.id}::uuid and state = 'active' and started_on > ${job.startedOn}::timestamptz - interval '1 millisecond' and started_on < ${job.startedOn}::timestamptz + interval '1 millisecond'`

const table = sql.id(jobsSchema, 'job')

/** Throws a `StaleJobError` unless this try still holds the job. */
export const holdJob = async (db: Db, job: Try) => {
  const { rows } = await sql`select 1 from ${table} where ${held(job)}`.execute(db)
  if (rows.length === 0) throw new StaleJobError(job.name)
}

const updated = async (db: Db, job: Try, data: RawBuilder<unknown>) => {
  const result = await sql`update ${table} set data = ${data} where ${held(job)}`.execute(db)
  if (result.numAffectedRows !== 1n) throw new StaleJobError(job.name)
}

/**
 * Keeps `progress` in the job's payload under `progress`, where its next try finds it: pg-boss keeps a job's data
 * when it retries it. Only while this try holds the job, or it throws a `StaleJobError`; in `db`'s transaction when it
 * is one, so the work it marks commits with it.
 */
export const saveJobProgress = (db: Db, job: Try, progress: unknown) => updated(db, job, sql`jsonb_set(data, '{progress}', ${JSON.stringify(progress)}::jsonb)`)

/** Replaces the job's payload with `data`, as when what it held is done with; only while this try holds the job. */
export const replaceJobData = (db: Db, job: Try, data: unknown) => updated(db, job, sql`${JSON.stringify(data)}::jsonb`)
