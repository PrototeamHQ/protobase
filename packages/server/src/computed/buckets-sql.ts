import { createHash } from 'node:crypto'
import type { BucketMeasure, ResourceModel } from '@protobase/schema'
import { identifier, quoteIdent } from '../changes/capture-sql'
import { rollupsSchema } from './rollup-sql'

/** A column of a time rollup's table: its name there, and the source column it is made from. */
export type BucketColumn = { column: string; from: string }

/** A time rollup with what its SQL names: the tables, qualified, and the columns. */
export type BucketsTarget = {
  model: ResourceModel
  /** The rollup's table. */
  table: string
  /** The source's table. */
  fromTable: string
  every: 'hour' | 'day'
  /** The source's time column. */
  time: string
  by: BucketColumn[]
  measures: (BucketColumn & { fn: BucketMeasure })[]
  /** The count of records with a value of each measured source column. */
  counts: BucketColumn[]
  /** The source's soft delete column, whose deleted records it leaves out. */
  softDelete?: string
  /**
   * The types the source's fields it reads have in their resource, such as `taken_at timestamp`: its table takes its
   * column types from the source's, and these name them in its statements, so a change of a field's type rebuilds it.
   */
  types: string[]
}

/** The comment that marks a table as a time rollup Protobase keeps. */
export const bucketsCommentPrefix = 'protobase time rollup: '

/** The function that recomputes a time rollup's buckets, named for its table. */
export const bucketsFunctionName = ({ model }: Pick<BucketsTarget, 'model'>) => identifier(`${[model.table.schema, model.table.name].filter(Boolean).join('_')}_refresh`)

const functionSql = (target: BucketsTarget) => `${quoteIdent(rollupsSchema)}.${quoteIdent(bucketsFunctionName(target))}`

// A name longer than Postgres keeps ends in a hash of the whole name, so two that share their first 63 bytes still differ.
const indexName = (target: Pick<BucketsTarget, 'model'>, suffix: string) => {
  const name = `${target.model.table.name}_${suffix}`
  if (identifier(name) === name) return quoteIdent(name)
  const hash = createHash('sha256').update(name).digest('hex').slice(0, 8)
  return quoteIdent(`${identifier(name, 54)}_${hash}`)
}

const groupColumns = (target: Pick<BucketsTarget, 'by'>) => ['bucket', ...target.by.map((column) => column.column)].map(quoteIdent)

const aggregateSql = ({ fn, from }: BucketsTarget['measures'][number]) => `${fn}(c.${quoteIdent(from)})`

// What the source's records give each bucket: its time, groups, count, measures and counts of values.
const selectSql = (target: BucketsTarget) => [
  `date_trunc('${target.every}', c.${quoteIdent(target.time)}::timestamptz) as ${quoteIdent('bucket')}`,
  ...target.by.map(({ column, from }) => `c.${quoteIdent(from)} as ${quoteIdent(column)}`),
  `count(*) as ${quoteIdent('events')}`,
  ...target.measures.map((measure) => `${aggregateSql(measure)} as ${quoteIdent(measure.column)}`),
  ...target.counts.map(({ column, from }) => `count(c.${quoteIdent(from)}) as ${quoteIdent(column)}`),
]

const groupBySql = (target: BucketsTarget) => [1, ...target.by.map((_, index) => index + 2)].join(', ')

/**
 * The statements that create a time rollup's table from the select its refresh runs, so Postgres types its columns as
 * the source's and the aggregates': the bucket, the groups, the count `events`, the measures and the counts of values,
 * then its key `id`; a unique btree index on `(bucket, groups...)`, which serves `bucket` and the refresh's upsert; and
 * one on `(group, bucket)` per group, so a filter on a group alone or with a range of buckets is served too.
 */
export const bucketsTableSql = (target: BucketsTarget) => [
  `create table ${target.table} as select ${selectSql(target).join(', ')} from ${target.fromTable} as c group by ${groupBySql(target)} with no data`,
  `alter table ${target.table} ${[
    `add column ${quoteIdent('id')} bigint generated always as identity primary key`,
    ...[...groupColumns(target), quoteIdent('events'), ...target.counts.map(({ column }) => quoteIdent(column))].map((column) => `alter column ${column} set not null`),
  ].join(', ')}`,
  `create unique index ${indexName(target, 'bucket_key')} on ${target.table} (${groupColumns(target).join(', ')})`,
  ...target.by.map(({ column }) => `create index ${indexName(target, `${column}_bucket`)} on ${target.table} (${quoteIdent(column)}, ${quoteIdent('bucket')})`),
]

/** The comment on a time rollup's table, which marks it as one and names the source's types it was made from. */
export const bucketsComment = (target: BucketsTarget) => `${bucketsCommentPrefix}from ${target.fromTable} (${target.types.join(', ')})`

const quoteLiteral = (text: string) => `'${text.replaceAll("'", "''")}'`

/**
 * The body of a time rollup's refresh function: in one statement, it counts and aggregates the source's records and
 * values from the bucket `$1` falls in, upserts those buckets and deletes the later ones that no longer have records.
 * That bucket's start is compared as a value of the time column's own type, so its index serves.
 */
export const bucketsBody = (target: BucketsTarget) => {
  const columns = [...groupColumns(target), quoteIdent('events'), ...[...target.measures, ...target.counts].map(({ column }) => quoteIdent(column))]
  const live = target.softDelete ? ` and c.${quoteIdent(target.softDelete)} is null` : ''
  const same = groupColumns(target).map((column) => `fresh.${column} = r.${column}`).join(' and ')
  const updated = columns.slice(groupColumns(target).length).map((column) => `${column} = excluded.${column}`).join(', ')
  return `
<<refresh>>
declare
  since ${target.fromTable}.${quoteIdent(target.time)}%type := date_trunc('${target.every}', $1);
begin
with fresh as (
  select ${selectSql(target).join(', ')}
  from ${target.fromTable} as c
  where c.${quoteIdent(target.time)} >= refresh.since${live}
  group by ${groupBySql(target)}
), gone as (
  delete from ${target.table} as r where r.${quoteIdent('bucket')} >= date_trunc('${target.every}', $1) and not exists (select from fresh where ${same})
)
insert into ${target.table} (${columns.join(', ')})
select ${columns.join(', ')} from fresh
on conflict (${groupColumns(target).join(', ')}) do update set ${updated};
end
`
}

/**
 * The refresh function runs as its caller, with a fixed search path and the tables qualified, in UTC, so buckets are
 * UTC hours and days whatever the session's time zone.
 */
export const bucketsFunctionSql = (target: BucketsTarget) =>
  `create or replace function ${functionSql(target)}("from" timestamptz) returns void language plpgsql set search_path = pg_catalog, pg_temp set timezone = 'UTC' as $buckets$${bucketsBody(target)}$buckets$`

/** Recomputes every bucket. */
export const bucketsFillSql = (target: BucketsTarget) => `select ${functionSql(target)}('-infinity')`

/** The statements that create a time rollup's table, mark it and write its function; it is empty until it is filled. */
export const createBucketsSql = (target: BucketsTarget) => [...bucketsTableSql(target), `comment on table ${target.table} is ${quoteLiteral(bucketsComment(target))}`, bucketsFunctionSql(target)]

export const dropBucketsTableSql = (table: string) => `drop table ${table}`
