import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { qualifiedTable } from './computed-input'
import { bucketsBody, bucketsTableSql, createBucketsSql, type BucketsTarget } from './buckets-sql'
import { bucketsTarget } from './buckets-targets'

const readings = resource('readings')
  .table('readings')
  .fields({
    id: f.bigint().readOnly(),
    org_id: f.integer().filterable(),
    device_id: f.relation('devices').filterable(),
    taken_at: f.timestamp().filterable(),
    watts: f.integer(),
    cost: f.decimal({ precision: 10, scale: 2 }),
    deleted_at: f.timestamp().optional(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.org_id)
  .softDelete((r) => r.deleted_at)
const hourly = resource('readings_hourly')
  .table('readings_hourly')
  .bucketsOf(readings, { time: (r) => r.taken_at, every: 'hour', by: (r) => [r.org_id, r.device_id], measures: { watts: ['sum', 'max'], cost: ['sum'] }, late: '2 hours' })

const target = bucketsTarget(hourly.toModel(), readings.toModel(), (model) => qualifiedTable(model.table))
const table = '"public"."readings_hourly"'

describe('the time rollup SQL', () => {
  it('creates the table from the select its refresh runs, so Postgres types its columns, then its key, not nulls and indexes', () => {
    const [create, alter, ...indexes] = createBucketsSql(target)
    expect(create).toBe(
      `create table ${table} as select date_trunc('hour', c."taken_at"::timestamptz) as "bucket", c."org_id" as "org_id", c."device_id" as "device_id", count(*) as "events", sum(c."watts") as "watts_sum", max(c."watts") as "watts_max", sum(c."cost") as "cost_sum", count(c."watts") as "watts_count", count(c."cost") as "cost_count" from "public"."readings" as c group by 1, 2, 3 with no data`,
    )
    expect(alter).toBe(
      `alter table ${table} add column "id" bigint generated always as identity primary key, alter column "bucket" set not null, alter column "org_id" set not null, alter column "device_id" set not null, alter column "events" set not null, alter column "watts_count" set not null, alter column "cost_count" set not null`,
    )
    expect(indexes).toEqual([
      `create unique index "readings_hourly_bucket_key" on ${table} ("bucket", "org_id", "device_id")`,
      `create index "readings_hourly_org_id_bucket" on ${table} ("org_id", "bucket")`,
      `create index "readings_hourly_device_id_bucket" on ${table} ("device_id", "bucket")`,
      `comment on table ${table} is 'protobase time rollup: from "public"."readings" (taken_at timestamp, org_id integer, device_id relation, watts integer, cost decimal, deleted_at timestamp)'`,
      expect.stringMatching(/^create or replace function "rollups"\."readings_hourly_refresh"\("from" timestamptz\) returns void language plpgsql set search_path = pg_catalog, pg_temp set timezone = 'UTC' as \$buckets\$/),
    ])
  })

  it('recomputes and upserts the buckets from the one `from` falls in, compared in the time column type, and deletes the emptied ones, in one statement', () => {
    expect(bucketsBody(target)).toBe(`
<<refresh>>
declare
  since "public"."readings"."taken_at"%type := date_trunc('hour', $1);
begin
with fresh as (
  select date_trunc('hour', c."taken_at"::timestamptz) as "bucket", c."org_id" as "org_id", c."device_id" as "device_id", count(*) as "events", sum(c."watts") as "watts_sum", max(c."watts") as "watts_max", sum(c."cost") as "cost_sum", count(c."watts") as "watts_count", count(c."cost") as "cost_count"
  from "public"."readings" as c
  where c."taken_at" >= refresh.since and c."deleted_at" is null
  group by 1, 2, 3
), gone as (
  delete from ${table} as r where r."bucket" >= date_trunc('hour', $1) and not exists (select from fresh where fresh."bucket" = r."bucket" and fresh."org_id" = r."org_id" and fresh."device_id" = r."device_id")
)
insert into ${table} ("bucket", "org_id", "device_id", "events", "watts_sum", "watts_max", "cost_sum", "watts_count", "cost_count")
select "bucket", "org_id", "device_id", "events", "watts_sum", "watts_max", "cost_sum", "watts_count", "cost_count" from fresh
on conflict ("bucket", "org_id", "device_id") do update set "events" = excluded."events", "watts_sum" = excluded."watts_sum", "watts_max" = excluded."watts_max", "cost_sum" = excluded."cost_sum", "watts_count" = excluded."watts_count", "cost_count" = excluded."cost_count";
end
`)
  })

  it('ends an index name Postgres would cut with a hash, so groups sharing a prefix keep apart', () => {
    const name = 'organization_device_readings_hourly_summary_table'
    const long = {
      model: { table: { name } },
      table: `"public"."${name}"`,
      fromTable: '"public"."readings"',
      every: 'hour',
      time: 'taken_at',
      by: [{ column: 'organization_id', from: 'organization_id' }, { column: 'organization_unit', from: 'organization_unit' }],
      measures: [],
      counts: [],
      types: [],
    } as unknown as BucketsTarget
    const names = bucketsTableSql(long).flatMap((statement) => /^create (?:unique )?index "([^"]+)"/.exec(statement)?.[1] ?? [])
    expect(names).toHaveLength(3)
    expect(new Set(names).size).toBe(3)
    for (const index of names) expect(new TextEncoder().encode(index).length).toBeLessThanOrEqual(63)
    expect(names[1]).toMatch(/^organization_device_readings_hourly_summary_table_orga_[0-9a-f]{8}$/)
  })
})
