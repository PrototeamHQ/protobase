import { createHash } from 'node:crypto'
import type { BucketMeasure, ResourceModel } from '@protobase/schema'
import { identifier, quoteIdent } from '../changes/capture-sql'
import { rollupsSchema } from './rollup-sql'

/** A column of a time rollup's table: its name there, the source column it is made from, and its type. */
export type BucketColumn = { column: string; from: string; type: string }

/** A time rollup with what its SQL names: the tables, as the catalogue qualifies them, the columns and their types. */
export type BucketsTarget = {
  model: ResourceModel
  /** The rollup's table. */
  table: string
  /** The source's table. */
  fromTable: string
  every: 'hour' | 'day'
  /** The source's time column, and whether it is a `timestamptz`. */
  time: { column: string; zoned: boolean }
  by: BucketColumn[]
  measures: (BucketColumn & { fn: BucketMeasure })[]
  /** The source's soft delete column, whose deleted records it leaves out. */
  softDelete?: string
}

/** The comment that marks a table as a time rollup Protobase keeps, with the statements it was created by. */
export const bucketsCommentPrefix = 'protobase time rollup: '

// A sum keeps ten digits more than its column, room for ten billion records of the greatest value; see buckets-of.ts.
const sumDigits = 10

/** The type of a sum of a source column, from the source column's type as `format_type` names it. */
export const sumType = (type: string) => {
  if (type === 'smallint' || type === 'integer') return 'bigint'
  if (type === 'bigint') return `numeric(${19 + sumDigits},0)`
  if (type === 'numeric') return 'numeric'
  const decimal = /^numeric\((\d+),(\d+)\)$/.exec(type)
  if (decimal) return `numeric(${Math.min(Number(decimal[1]) + sumDigits, 1000)},${decimal[2]})`
  throw new Error(`Not implemented: the sum of a ${type} column in a time rollup`)
}

/** The function that recomputes a time rollup's buckets, named for its table. */
export const bucketsFunctionName = ({ model }: Pick<BucketsTarget, 'model'>) => identifier(`${[model.table.schema, model.table.name].filter(Boolean).join('_')}_refresh`)

const functionSql = (target: BucketsTarget) => `${quoteIdent(rollupsSchema)}.${quoteIdent(bucketsFunctionName(target))}`

// A name longer than Postgres keeps ends in a hash of the whole name, so two that share their first 63 bytes still differ.
const indexName = (target: BucketsTarget, suffix: string) => {
  const name = `${target.model.table.name}_${suffix}`
  if (identifier(name) === name) return quoteIdent(name)
  const hash = createHash('sha256').update(name).digest('hex').slice(0, 8)
  return quoteIdent(`${identifier(name, 54)}_${hash}`)
}

const groupColumns = (target: BucketsTarget) => ['bucket', ...target.by.map((column) => column.column)].map(quoteIdent)

/**
 * The statements that create a time rollup's table: its key `id`, `bucket`, the groups, the count `events` and the
 * measures; a unique btree index on `(bucket, groups...)`, which serves `bucket` and the refresh's upsert; and one on
 * `(group, bucket)` per group, so a filter on a group alone or with a range of buckets is served too.
 */
export const bucketsTableSql = (target: BucketsTarget) => [
  `create table ${target.table} (${[
    `${quoteIdent('id')} bigint generated always as identity primary key`,
    `${quoteIdent('bucket')} timestamptz not null`,
    ...target.by.map(({ column, type }) => `${quoteIdent(column)} ${type} not null`),
    `${quoteIdent('events')} bigint not null`,
    ...target.measures.map(({ column, type }) => `${quoteIdent(column)} ${type}`),
  ].join(', ')})`,
  `create unique index ${indexName(target, 'bucket_key')} on ${target.table} (${groupColumns(target).join(', ')})`,
  ...target.by.map(({ column }) => `create index ${indexName(target, `${column}_bucket`)} on ${target.table} (${quoteIdent(column)}, ${quoteIdent('bucket')})`),
]

/** The comment on a time rollup's table, which names the statements that created it, so a changed rollup is found. */
export const bucketsComment = (target: BucketsTarget) => `${bucketsCommentPrefix}${bucketsTableSql(target).join('; ')}`

const quoteLiteral = (text: string) => `'${text.replaceAll("'", "''")}'`

// The first bucket the refresh recomputes: the one `from` falls in, whole, compared in the time column's own type so its
// index serves.
const startSql = ({ every, time }: BucketsTarget) => `date_trunc('${every}', $1)${time.zoned ? '' : '::timestamp'}`

const aggregateSql = ({ fn, from }: BucketsTarget['measures'][number]) => `${fn}(c.${quoteIdent(from)})`

/**
 * The body of a time rollup's refresh function: in one statement, it counts and aggregates the source's records from
 * the bucket `$1` falls in, upserts those buckets and deletes the later ones that no longer have records.
 */
export const bucketsBody = (target: BucketsTarget) => {
  const columns = [...groupColumns(target), quoteIdent('events'), ...target.measures.map(({ column }) => quoteIdent(column))]
  const select = [
    `date_trunc('${target.every}', c.${quoteIdent(target.time.column)}::timestamptz) as ${quoteIdent('bucket')}`,
    ...target.by.map(({ column, from }) => `c.${quoteIdent(from)} as ${quoteIdent(column)}`),
    `count(*) as ${quoteIdent('events')}`,
    ...target.measures.map((measure) => `${aggregateSql(measure)} as ${quoteIdent(measure.column)}`),
  ]
  const live = target.softDelete ? ` and c.${quoteIdent(target.softDelete)} is null` : ''
  const groupBy = [1, ...target.by.map((_, index) => index + 2)].join(', ')
  const same = groupColumns(target).map((column) => `fresh.${column} = r.${column}`).join(' and ')
  const updated = columns.slice(groupColumns(target).length).map((column) => `${column} = excluded.${column}`).join(', ')
  return `
with fresh as (
  select ${select.join(', ')}
  from ${target.fromTable} as c
  where c.${quoteIdent(target.time.column)} >= ${startSql(target)}${live}
  group by ${groupBy}
), gone as (
  delete from ${target.table} as r where r.${quoteIdent('bucket')} >= date_trunc('${target.every}', $1) and not exists (select from fresh where ${same})
)
insert into ${target.table} (${columns.join(', ')})
select ${columns.join(', ')} from fresh
on conflict (${groupColumns(target).join(', ')}) do update set ${updated}
`
}

/**
 * The refresh function runs as its caller, with a fixed search path and the tables qualified, in UTC, so buckets are
 * UTC hours and days whatever the session's time zone.
 */
export const bucketsFunctionSql = (target: BucketsTarget) =>
  `create or replace function ${functionSql(target)}("from" timestamptz) returns void language sql set search_path = pg_catalog, pg_temp set timezone = 'UTC' as $buckets$${bucketsBody(target)}$buckets$`

/** Recomputes every bucket. */
export const bucketsFillSql = (target: BucketsTarget) => `select ${functionSql(target)}('-infinity')`

/** The statements that create a time rollup's table, mark it, write its function and fill it. */
export const createBucketsSql = (target: BucketsTarget) => [
  ...bucketsTableSql(target),
  `comment on table ${target.table} is ${quoteLiteral(bucketsComment(target))}`,
  bucketsFunctionSql(target),
  bucketsFillSql(target),
]

export const dropBucketsTableSql = (target: BucketsTarget) => `drop table ${target.table}`
