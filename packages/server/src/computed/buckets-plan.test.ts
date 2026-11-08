import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { bucketsPlan, type BucketsState, type FoundBuckets } from './buckets-plan'
import { bucketsTableSql, sumType, type BucketsTarget } from './buckets-sql'

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
const models = [readings.toModel(), hourly.toModel()]

const types = { id: 'bigint', org_id: 'integer', device_id: 'uuid', taken_at: 'timestamp with time zone', watts: 'integer', cost: 'numeric(10,2)', deleted_at: 'timestamp with time zone' }
const missing: FoundBuckets = { from: { sql: 'public.readings', types }, table: null, functionSource: null }
const state = (found: Partial<FoundBuckets>): BucketsState => ({ schema: 'public', rollups: { readings_hourly: { ...missing, ...found } } })

const created = bucketsPlan(models, state({})).statements
const table = '"public"."readings_hourly"'

describe('the time rollup SQL', () => {
  it('creates the table, its indexes and function, and fills it', () => {
    expect(created).toEqual([
      'create schema if not exists "rollups"',
      `create table ${table} ("id" bigint generated always as identity primary key, "bucket" timestamptz not null, "org_id" integer not null, "device_id" uuid not null, "events" bigint not null, "watts_sum" bigint, "watts_max" integer, "cost_sum" numeric(20,2))`,
      `create unique index "readings_hourly_bucket_key" on ${table} ("bucket", "org_id", "device_id")`,
      `create index "readings_hourly_org_id_bucket" on ${table} ("org_id", "bucket")`,
      `create index "readings_hourly_device_id_bucket" on ${table} ("device_id", "bucket")`,
      expect.stringMatching(/^comment on table "public"\."readings_hourly" is 'protobase time rollup: create table /),
      expect.stringMatching(/^create or replace function "rollups"\."readings_hourly_refresh"\("from" timestamptz\) returns void language sql set search_path = pg_catalog, pg_temp set timezone = 'UTC' as \$buckets\$/),
      `select "rollups"."readings_hourly_refresh"('-infinity')`,
    ])
  })

  it('recomputes and upserts the buckets from the one `from` falls in, and deletes the emptied ones, in one statement', () => {
    expect(created[6]).toContain(`
with fresh as (
  select date_trunc('hour', c."taken_at"::timestamptz) as "bucket", c."org_id" as "org_id", c."device_id" as "device_id", count(*) as "events", sum(c."watts") as "watts_sum", max(c."watts") as "watts_max", sum(c."cost") as "cost_sum"
  from public.readings as c
  where c."taken_at" >= date_trunc('hour', $1) and c."deleted_at" is null
  group by 1, 2, 3
), gone as (
  delete from ${table} as r where r."bucket" >= date_trunc('hour', $1) and not exists (select from fresh where fresh."bucket" = r."bucket" and fresh."org_id" = r."org_id" and fresh."device_id" = r."device_id")
)
insert into ${table} ("bucket", "org_id", "device_id", "events", "watts_sum", "watts_max", "cost_sum")
select "bucket", "org_id", "device_id", "events", "watts_sum", "watts_max", "cost_sum" from fresh
on conflict ("bucket", "org_id", "device_id") do update set "events" = excluded."events", "watts_sum" = excluded."watts_sum", "watts_max" = excluded."watts_max", "cost_sum" = excluded."cost_sum"
`)
  })

  it('compares a plain timestamp column with the start in its own type, so its index serves', () => {
    const plain = bucketsPlan(models, { schema: 'public', rollups: { readings_hourly: { ...missing, from: { sql: 'public.readings', types: { ...types, taken_at: 'timestamp without time zone' } } } } })
    expect(plain.statements.find((statement) => statement.startsWith('create or replace function'))).toContain(`where c."taken_at" >= date_trunc('hour', $1)::timestamp and`)
  })

  it('ends an index name Postgres would cut with a hash, so groups sharing a prefix keep apart', () => {
    const name = 'organization_device_readings_hourly_summary_table'
    const target = {
      model: { table: { name } },
      table: `"public"."${name}"`,
      by: [{ column: 'organization_id', from: 'organization_id', type: 'integer' }, { column: 'organization_unit', from: 'organization_unit', type: 'integer' }],
      measures: [],
    } as unknown as BucketsTarget
    const names = bucketsTableSql(target).flatMap((statement) => /^create (?:unique )?index "([^"]+)"/.exec(statement)?.[1] ?? [])
    expect(names).toHaveLength(3)
    expect(new Set(names).size).toBe(3)
    for (const index of names) expect(new TextEncoder().encode(index).length).toBeLessThanOrEqual(63)
    expect(names[1]).toMatch(/^organization_device_readings_hourly_summary_table_orga_[0-9a-f]{8}$/)
  })

  it('keeps sums ten digits wider than their column', () => {
    expect(['smallint', 'integer', 'bigint', 'numeric', 'numeric(10,2)', 'numeric(995,3)'].map(sumType)).toEqual(['bigint', 'bigint', 'numeric(29,0)', 'numeric', 'numeric(20,2)', 'numeric(1000,3)'])
    expect(() => sumType('real')).toThrow('Not implemented: the sum of a real column in a time rollup')
  })
})

describe('bucketsPlan', () => {
  const target = { schema: 'public', comment: '' }
  const current = () => {
    const comment = created[5]!.slice(created[5]!.indexOf(" is '") + 5, -1).replaceAll("''", "'")
    const source = created[6]!.slice(created[6]!.indexOf('$buckets$') + 9, created[6]!.lastIndexOf('$buckets$'))
    return { comment, source }
  }

  it('is empty while the table, its comment and function are current', () => {
    const { comment, source } = current()
    expect(bucketsPlan(models, state({ table: { ...target, comment }, functionSource: source }))).toEqual({ statements: [], behind: [] })
  })

  it('writes a changed function again and fills the rollup', () => {
    const { comment } = current()
    const plan = bucketsPlan(models, state({ table: { ...target, comment }, functionSource: 'select 1' }))
    expect(plan.behind).toEqual(['readings_hourly'])
    expect(plan.statements.slice(1).map((statement) => statement.slice(0, 40))).toEqual([created[6]!.slice(0, 40), created[7]!.slice(0, 40)])
  })

  it('creates a changed rollup again', () => {
    const plan = bucketsPlan(models, state({ table: { ...target, comment: 'protobase time rollup: create table something else' } }))
    expect(plan.statements[1]).toBe(`-- The time rollup "readings_hourly" changed: its table is created again and filled\ndrop table ${table}`)
    expect(plan.statements.slice(2)).toEqual(created.slice(1))
  })

  it('refuses a table of the project own and a missing source table', () => {
    expect(() => bucketsPlan(models, state({ table: { ...target, comment: null } }))).toThrow(`Table ${table} of time rollup "readings_hourly" is a table of the project's own`)
    expect(() => bucketsPlan(models, state({ from: null }))).toThrow('The table of resource "readings", which "readings_hourly" rolls up, does not exist')
    const { watts: _, ...withoutWatts } = types
    expect(() => bucketsPlan(models, state({ from: { sql: 'public.readings', types: withoutWatts } }))).toThrow('Table public.readings has no column "watts" for field "readings.watts"')
    expect(() => bucketsPlan([hourly.toModel()], state({}))).toThrow('Resource "readings_hourly" is a time rollup of "readings", which is not a resource')
  })

  it('finds a changed measure by the comment', () => {
    const { comment, source } = current()
    const fewer = resource('readings_hourly').table('readings_hourly').bucketsOf(readings, { time: (r) => r.taken_at, every: 'hour', by: (r) => [r.org_id, r.device_id], measures: { watts: ['sum'] }, late: '2 hours' })
    const plan = bucketsPlan([readings.toModel(), fewer.toModel()], state({ table: { ...target, comment }, functionSource: source }))
    expect(plan.behind).toEqual(['readings_hourly'])
    expect(plan.statements[1]).toContain('drop table')
  })
})
