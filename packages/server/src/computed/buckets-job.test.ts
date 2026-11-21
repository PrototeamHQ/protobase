import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from 'kysely'
import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import type { JobContext } from '../jobs/job-types'
import { nextRun } from '../jobs/schedule'
import { bucketsRefreshes, bucketsRefreshJob } from './buckets-job'

const readings = resource('readings').table('readings').fields({ id: f.bigint().readOnly(), kind: f.text(), taken_at: f.timestamp() }).primaryKey((r) => r.id)
const hourly = resource('readings_hourly').table('readings_hourly').bucketsOf(readings, { time: (r) => r.taken_at, every: 'hour', by: (r) => [r.kind], late: '2 hours' })
const daily = resource('readings_daily').table('reports.readings_daily').bucketsOf(readings, { time: (r) => r.taken_at, every: 'day', by: () => [], late: '1 day' })
const models = [readings.toModel(), hourly.toModel(), daily.toModel()]

describe('the time rollups refresh job', () => {
  it('runs every minute, one try a run', () => {
    const job = bucketsRefreshJob(models)
    expect(job.name).toBe('buckets.refresh')
    expect(job.options.maxAttempts).toBe(1)
    expect(job.options.timezone).toBeUndefined()
    expect(nextRun(job.options.schedule!, 'UTC', new Date('2026-07-07T10:00:30Z'))).toEqual(new Date('2026-07-07T10:01:00Z'))
    expect(nextRun(job.options.schedule!, 'UTC', new Date('2026-07-07T10:01:00Z'))).toEqual(new Date('2026-07-07T10:02:00Z'))
  })

  it("calls each rollup's refresh function with its own late, and nothing for other resources", () => {
    expect(bucketsRefreshes(models)).toEqual([
      { fn: '"rollups"."readings_hourly_refresh"', late: '2 hours' },
      { fn: '"rollups"."reports_readings_daily_refresh"', late: '1 day' },
    ])
  })

  it('sends one statement per rollup, from late before now', async () => {
    // Compiles queries as Postgres would get them and answers each with no rows: what is kept is the SQL sent.
    const sent: { sql: string; parameters: readonly unknown[] }[] = []
    const db = new Kysely<any>({
      dialect: { createAdapter: () => new PostgresAdapter(), createDriver: () => new DummyDriver(), createIntrospector: (kysely) => new PostgresIntrospector(kysely), createQueryCompiler: () => new PostgresQueryCompiler() },
      log: (event) => void sent.push({ sql: event.query.sql, parameters: event.query.parameters }),
    })
    await bucketsRefreshJob(models).options.run(undefined, { db } as JobContext)
    expect(sent).toEqual([
      { sql: 'select "rollups"."readings_hourly_refresh"(now() - $1::interval)', parameters: ['2 hours'] },
      { sql: 'select "rollups"."reports_readings_daily_refresh"(now() - $1::interval)', parameters: ['1 day'] },
    ])
  })
})
