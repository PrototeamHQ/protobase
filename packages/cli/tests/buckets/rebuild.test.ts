import { Kysely } from 'kysely'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { computedSchemaSql } from '@protobase/server'
import { bucketsRefreshes, refreshBuckets } from '@protobase/server/internal'
import { openSnapshotDb, type SnapshotDb } from '../../../../test-support/sql-snapshot'
import { parseFrom, rebuildBuckets } from '../../src/buckets/rebuild'

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

const counted = `select bucket, org_id, events::int from readings_hourly order by bucket`

let pg: SnapshotDb
let db: Kysely<any>
beforeAll(async () => {
  pg = await openSnapshotDb('empty')
  await pg.exec(`
    create table readings (id bigint generated always as identity primary key, org_id integer not null, taken_at timestamptz not null);
    create index on readings (taken_at);
    create index on readings (org_id);
    insert into readings (org_id, taken_at) values (1, '2026-06-30 23:10:00+00');
  `)
  db = new Kysely({ dialect: pg.dialect })
  await pg.exec(computedSchemaSql(models))
})
afterAll(async () => { await db.destroy() })

it('counts a record imported later than late once the rollup is rebuilt from its time', async () => {
  await pg.exec(`insert into readings (org_id, taken_at) values (1, '2026-07-01 10:15:00+00'), (1, '2026-07-01 10:45:00+00')`)
  await refreshBuckets(db, bucketsRefreshes(models))
  expect((await pg.query(counted)).rows).toEqual([{ bucket: new Date('2026-06-30T23:00:00Z'), org_id: 1, events: 1 }])

  await rebuildBuckets(db, models, 'readings_hourly', parseFrom('2026-07-01'))
  expect((await pg.query(counted)).rows).toEqual([
    { bucket: new Date('2026-06-30T23:00:00Z'), org_id: 1, events: 1 },
    { bucket: new Date('2026-07-01T10:00:00Z'), org_id: 1, events: 2 },
  ])
})
