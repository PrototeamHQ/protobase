import { Kysely, PostgresDialect } from 'kysely'
import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { parseFrom, rebuildBuckets } from './rebuild'

const readings = resource('readings')
  .table('readings')
  .fields({ id: f.bigint().readOnly(), org_id: f.integer().filterable(), taken_at: f.timestamp().filterable() })
  .primaryKey((r) => r.id)
  .tenant((r) => r.org_id)
const hourly = resource('readings_hourly')
  .table('readings_hourly')
  .bucketsOf(readings, { time: (r) => r.taken_at, every: 'hour', by: (r) => [r.org_id], late: '2 hours' })
  .access({ read: () => true })
const models = [readings.toModel(), hourly.toModel()]

// A database that keeps the statements it is sent and answers each with no rows.
const recording = () => {
  const sent: { sql: string; params: readonly unknown[] }[] = []
  const client = {
    query: async (text: string, params: unknown[]) => {
      sent.push({ sql: text, params })
      return { command: 'SELECT', rowCount: 0, rows: [] }
    },
    release: () => {},
  }
  const db = new Kysely<any>({ dialect: new PostgresDialect({ pool: { connect: async () => client, end: async () => {} } as never }) })
  return { db, sent }
}

describe('parseFrom', () => {
  it('reads a date, a date and time, and a zone, as UTC unless it names one', () => {
    expect(parseFrom('2026-07-01')).toBe('2026-07-01T00:00:00.000Z')
    expect(parseFrom('2026-07-01T10:30')).toBe('2026-07-01T10:30:00.000Z')
    expect(parseFrom('2026-07-01 10:30:15.5')).toBe('2026-07-01T10:30:15.500Z')
    expect(parseFrom('2026-07-01T00:30+02:00')).toBe('2026-06-30T22:30:00.000Z')
  })

  it('refuses a value that is not a time, naming it', () => {
    for (const value of ['yesterday', '2026-02-30', '2026-07-01T25:00', "2026-07-01'); drop table readings; --", ''])
      expect(() => parseFrom(value)).toThrow(`--from "${value}" is not a time`)
  })
})

describe('rebuildBuckets', () => {
  it("calls the rollup's refresh function from the given time, as a bound parameter", async () => {
    const { db, sent } = recording()
    await rebuildBuckets(db, models, 'readings_hourly', '2026-07-01T00:00:00.000Z')
    expect(sent).toEqual([{ sql: 'select "rollups"."readings_hourly_refresh"($1::timestamptz)', params: ['2026-07-01T00:00:00.000Z'] }])
  })

  it('recounts every bucket without a time', async () => {
    const { db, sent } = recording()
    await rebuildBuckets(db, models, 'readings_hourly', undefined)
    expect(sent).toEqual([{ sql: 'select "rollups"."readings_hourly_refresh"($1::timestamptz)', params: ['-infinity'] }])
  })

  it('refuses a resource that is not a time rollup, and one the project lacks, sending nothing', async () => {
    const { db, sent } = recording()
    await expect(rebuildBuckets(db, models, 'readings', undefined)).rejects.toThrow('"readings" is not a time rollup')
    await expect(rebuildBuckets(db, models, 'nope', undefined)).rejects.toThrow('The project has no resource "nope"')
    expect(sent).toEqual([])
  })
})
