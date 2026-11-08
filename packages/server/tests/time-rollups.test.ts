import { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { checkComputed, computedMigration, createAdmin } from '../src/index'
import { as, testAuthenticator } from '../../../test-support/server'
import { openSnapshotDb, type SnapshotDb } from '../../../test-support/sql-snapshot'

const readings = resource('readings')
  .table('readings')
  .fields({
    id: f.bigint().readOnly(),
    org_id: f.integer().filterable(),
    kind: f.text().filterable(),
    taken_at: f.timestamp().filterable(),
    watts: f.integer().optional(),
    cost: f.decimal({ precision: 10, scale: 2 }).optional(),
    deleted_at: f.timestamp().optional(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.org_id)
  .softDelete((r) => r.deleted_at)
const hourly = resource('readings_hourly')
  .table('readings_hourly')
  .bucketsOf(readings, { time: (r) => r.taken_at, every: 'hour', by: (r) => [r.org_id, r.kind], measures: { watts: ['sum', 'max'], cost: ['sum'] }, late: '2 hours' })
  .access({ read: () => true })
const models = [readings.toModel(), hourly.toModel()]

// The rollup's rows that a GROUP BY over the live records does not give, and those it gives that the rollup lacks.
const compared = `
with expected as (
  select date_trunc('hour', taken_at, 'UTC') as bucket, org_id, kind, count(*) as events, sum(watts) as watts_sum, max(watts) as watts_max, sum(cost) as cost_sum
  from readings where deleted_at is null group by 1, 2, 3
), actual as (select bucket, org_id, kind, events, watts_sum, watts_max, cost_sum from readings_hourly)
select (select count(*)::int from expected) as expected, (select count(*)::int from actual) as actual,
  (select count(*)::int from ((select * from expected except all select * from actual) union all (select * from actual except all select * from expected)) as d) as differ`

let pg: SnapshotDb
let db: Kysely<any>
beforeAll(async () => {
  pg = await openSnapshotDb('empty')
  await pg.exec(`
    create table readings (id bigint generated always as identity primary key, org_id integer not null, kind text not null, taken_at timestamptz not null, watts integer, cost numeric(10,2), deleted_at timestamptz);
    create index on readings (taken_at);
    create index on readings (org_id);
    insert into readings (org_id, kind, taken_at, watts, cost, deleted_at)
      select 1 + i % 2, case when i % 3 = 0 then 'heat' else 'power' end, timestamptz '2026-11-01 00:00:00+00' + i * interval '97 seconds',
        case when i % 7 = 0 then null else i % 500 end, (i % 1000) / 100.0, case when i % 11 = 0 then timestamptz '2026-11-05 00:00:00+00' end
      from generate_series(1, 6000) as i;
    -- The buckets are UTC hours whatever the session's time zone, here one half an hour off.
    set timezone = 'Asia/Kolkata';
  `)
  db = new Kysely({ dialect: pg.dialect })
})
afterAll(async () => { await db.destroy() })

describe('a time rollup', () => {
  it('refuses to start before its migration', async () => {
    await expect(checkComputed(db, models)).rejects.toThrow('time rollups readings_hourly are not kept by the database as declared')
  })

  it('is created and filled by the migration, with the counts and sums of a GROUP BY over the source', async () => {
    await pg.exec((await computedMigration(db, models))!)
    expect((await pg.query(compared)).rows).toEqual([{ expected: 648, actual: 648, differ: 0 }])
    expect(await computedMigration(db, models)).toBeUndefined()
    await expect(checkComputed(db, models)).resolves.toBeUndefined()
  })

  it('recomputes the buckets from the one a refresh starts in, dropping those left without records', async () => {
    await pg.exec(`
      insert into readings (org_id, kind, taken_at, watts, cost) values (1, 'heat', '2026-11-07 15:10:00+00', 40, 1.25), (2, 'wind', '2026-11-07 16:59:59+00', 7, 0.5);
      update readings set watts = watts + 1 where taken_at >= '2026-11-07 10:00:00+00';
      update readings set deleted_at = '2026-11-08 00:00:00+00' where taken_at >= '2026-11-07 14:00:00+00' and taken_at < '2026-11-07 15:00:00+00';
    `)
    expect((await pg.query(compared)).rows[0].differ).toBeGreaterThan(0)
    await pg.query(`select rollups.readings_hourly_refresh('2026-11-07 10:30:00+00')`)
    expect((await pg.query(compared)).rows).toEqual([{ expected: 645, actual: 645, differ: 0 }])
  })

  it('is listed in the caller tenant through the indexes, and never written', async () => {
    const app = createAdmin({ resources: [readings, hourly], db, authenticate: testAuthenticator })
    const filter = encodeURIComponent('kind = "heat" AND bucket >= "2026-11-07T00:00:00Z"')
    const list = await app.request(`/api/v1/readings_hourly?filter=${filter}&order_by=bucket&page_size=2`, { headers: as(1) })
    expect(list.status).toBe(200)
    const { items } = await list.json()
    expect(items.map(({ bucket, org_id, kind }: Record<string, unknown>) => ({ bucket, org_id, kind }))).toEqual([
      { bucket: '2026-11-07T00:00:00.000Z', org_id: 1, kind: 'heat' },
      { bucket: '2026-11-07T01:00:00.000Z', org_id: 1, kind: 'heat' },
    ])
    const created = await app.request('/api/v1/readings_hourly', { method: 'POST', headers: { ...as(1), 'content-type': 'application/json' }, body: '{}' })
    expect(created.status).toBe(403)
  })
})
