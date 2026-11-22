import { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { computedMigration, createAdmin } from '../src/index'
import { as, testAuthenticator } from '../../../test-support/server'
import { openSnapshotDb, type SnapshotDb } from '../../../test-support/sql-snapshot'

const readings = resource('readings')
  .table('readings')
  .fields({
    id: f.bigint().readOnly(),
    org_id: f.integer().filterable(),
    kind: f.text().filterable(),
    taken_at: f.timestamp().filterable(),
    watts: f.integer(),
    cost: f.decimal({ precision: 10, scale: 2 }),
    peak: f.integer().optional(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.org_id)
const hourly = resource('readings_hourly')
  .table('readings_hourly')
  .bucketsOf(readings, { time: (r) => r.taken_at, every: 'hour', by: (r) => [r.org_id, r.kind], measures: { watts: ['sum', 'max'], cost: ['sum'], peak: ['sum'] }, late: '2 hours' })
  .access({ read: () => true })
const daily = resource('readings_daily')
  .table('readings_daily')
  .bucketsOf(readings, { time: (r) => r.taken_at, every: 'day', by: (r) => [r.org_id], measures: { watts: ['sum'] }, late: '1 day' })
  .access({ read: () => true })

let pg: SnapshotDb
let db: Kysely<any>
let app: ReturnType<typeof createAdmin>
beforeAll(async () => {
  pg = await openSnapshotDb('empty')
  await pg.exec(`
    create table readings (id bigint generated always as identity primary key, org_id integer not null, kind text not null, taken_at timestamptz not null, watts integer not null, cost numeric(10,2) not null, peak integer);
    create index on readings (taken_at);
    create index on readings (org_id, kind);
    insert into readings (org_id, kind, taken_at, watts, cost, peak)
      select 1 + i % 2, case when i % 3 = 0 then 'heat' else 'power' end, timestamptz '2026-07-01 00:00:00+00' + i * interval '263 seconds',
        i % 500, (i % 1000) / 100.0, case when i % 7 > 0 then i % 90 end
      from generate_series(1, 3000) as i;
    -- An Amsterdam day without any peak
    update readings set peak = null where taken_at >= '2026-07-04 22:00:00+00' and taken_at < '2026-07-05 22:00:00+00';
  `)
  db = new Kysely({ dialect: pg.dialect })
  await pg.exec((await computedMigration(db, [readings.toModel(), hourly.toModel(), daily.toModel()]))!)
  app = createAdmin({ resources: [readings, hourly, daily], db, authenticate: testAuthenticator })
})
afterAll(async () => { await db.destroy() })

const get = async (path: string) => {
  const response = await app.request(`/api/v1/${path}`, { headers: as(1) })
  return { status: response.status, body: await response.json() }
}
// Amsterdam's days, a whole number of UTC hours off, over whole hours of the readings
const range = 'from=2026-07-02T00:00:00%2B02:00&to=2026-07-09T00:00:00%2B02:00&time_zone=Europe/Amsterdam'

describe('a time rollup read by :aggregate and :series', () => {
  it('gives the counts of the records its buckets hold', async () => {
    const raw = await get(`readings:series?field=taken_at&granularity=day&${range}`)
    const rolled = await get(`readings_hourly:series?field=bucket&granularity=day&${range}`)
    expect(raw.status).toBe(200)
    expect(rolled.body.points).toEqual(raw.body.points)
    expect(raw.body.points.reduce((total: number, point: { count: number }) => total + point.count, 0)).toBeGreaterThan(1000)
    const series = { field: 'bucket', from: '2026-07-02T00:00:00+02:00', to: '2026-07-09T00:00:00+02:00', granularity: 'day', time_zone: 'Europe/Amsterdam' }
    const batch = await app.request('/api/v1/readings_hourly:batchAggregates', { method: 'POST', headers: { ...as(1), 'content-type': 'application/json' }, body: JSON.stringify({ series: [series] }) })
    expect((await batch.json()).series[0].points).toEqual(raw.body.points)
  })

  it('gives the average, sum and maximum the records give, per day of the time zone', async () => {
    for (const [measure, raw, rolled] of [['average', 'watts', 'watts_sum'], ['sum', 'cost', 'cost_sum'], ['maximum', 'watts', 'watts_max'], ['average', 'cost', 'cost_sum']]) {
      const expected = await get(`readings:aggregate?group_by=taken_at&${measure}=${raw}&granularity=day&${range}`)
      const actual = await get(`readings_hourly:aggregate?group_by=bucket&${measure}=${rolled}&granularity=day&${range}`)
      expect(expected.status).toBe(200)
      expect(actual.body.groups).toEqual(expected.body.groups)
    }
    const { body } = await get(`readings_hourly:aggregate?group_by=bucket&average=watts_sum&granularity=day&${range}`)
    expect(body.groups.some((group: { average: number }) => !Number.isInteger(group.average))).toBe(true)
  })

  it('gives the average of an optional field over the records with a value, and none for a day without', async () => {
    const expected = await get(`readings:aggregate?group_by=taken_at&average=peak&granularity=day&${range}`)
    const actual = await get(`readings_hourly:aggregate?group_by=bucket&average=peak_sum&granularity=day&${range}`)
    expect(expected.status).toBe(200)
    expect(actual.body.groups).toEqual(expected.body.groups)
    expect(actual.body.groups.filter((group: { average: number | null }) => group.average === null)).toHaveLength(1)
  })

  it('gives the totals per value of a field the records give', async () => {
    const expected = await get('readings:aggregate?group_by=kind&average=watts')
    const actual = await get('readings_hourly:aggregate?group_by=kind&average=watts_sum')
    expect(actual.body.groups).toEqual(expected.body.groups)
  })

  it('refuses what its buckets cannot give', async () => {
    const refusals = [
      `readings_hourly:series?field=bucket&granularity=15_minutes&${range}`,
      'readings_hourly:series?field=bucket&granularity=day&from=2026-07-02T00:00:00Z&to=2026-07-04T00:00:00Z&time_zone=Asia/Kolkata',
      'readings_daily:series?field=bucket&granularity=day&from=2026-07-02T00:00:00Z&to=2026-07-04T00:00:00Z&time_zone=Europe/Amsterdam',
      `readings_hourly:aggregate?group_by=bucket&average=watts_max&granularity=day&${range}`,
      `readings_hourly:aggregate?group_by=bucket&average=peak_count&granularity=day&${range}`,
    ]
    for (const path of refusals) expect(await get(path)).toMatchObject({ status: 400, body: { type: expect.stringContaining('invalid-option') } })
    expect((await get('readings_daily:series?field=bucket&granularity=week&from=2026-06-29T00:00:00Z&to=2026-07-13T00:00:00Z')).status).toBe(200)
  })
})
