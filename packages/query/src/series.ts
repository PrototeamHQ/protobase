import { sql, type SqlBool } from 'kysely'
import type { CheckedFilter, ResourceModel } from '@protobase/schema'
import { baseQuery } from './base-query'
import type { Db } from './db'
import { assertFilterRequirements } from './filter-requirements'
import { toNumber } from './numbers'
import { measureSql, measureValue, type Measure } from './measure'
import { seriesBuckets, type BucketOptions } from './series-buckets'
import type { Scope } from './scope'

export type SeriesOptions = BucketOptions & {
  filter?: CheckedFilter
  scope?: Scope
  /** Adds up a numeric field per bucket besides the count. */
  measure?: Measure
}
export type { Granularity } from './series-buckets'
export type SeriesPoint = { bucket: string; count: number; sum?: number | null; average?: number | null; maximum?: number | null }

/**
 * Row counts per calendar bucket (or of 1, 5 or 15 minutes), in `timeZone`, with empty buckets present. `to` is exclusive.
 * Buckets are returned as local ISO strings without offset. `date` fields ignore the time zone;
 * `timestamp` columns without a zone are read in the session time zone. With a measure, a bucket without a row to add
 * up has `null` for it.
 */
export const series = async (db: Db, model: ResourceModel, field: string, options: SeriesOptions): Promise<SeriesPoint[]> => {
  const { col, from, to, truncate, step, bound, local, laterBucket, isDate } = seriesBuckets(model, field, options)
  const { measure } = options
  const amount = measure ? measureSql(model, measure) : undefined
  await assertFilterRequirements(db, options.filter, options.scope)

  const counts = baseQuery(db, model, options.filter, options.scope)
    .where(sql<SqlBool>`${col} >= ${from}::${bound} and ${col} < ${to}::${bound}`)
    .select([
      truncate(isDate ? sql`${col}::timestamp` : local(col)).as('bucket'),
      sql`count(*)::text`.as('n'),
      ...(amount ? [sql`${amount}::text`.as('m')] : []),
    ])
    .groupBy(sql`1`)

  const result = await sql<{ bucket: string; n: unknown; m?: unknown }>`
    with b as (
      select generate_series(${truncate(local(from))}, ${laterBucket}, ${step}) as bucket
    ), c as (${counts})
    select to_char(b.bucket, 'YYYY-MM-DD"T"HH24:MI:SS') as bucket, coalesce(c.n, '0') as n${amount ? sql`, c.m` : sql``}
    from b left join c on c.bucket = b.bucket
    order by b.bucket
  `.execute(db)
  return result.rows.map(row => {
    const point = { bucket: row.bucket, count: toNumber(row.n) }
    return measure ? { ...point, [measure.kind]: measureValue(row.m) } : point
  })
}
