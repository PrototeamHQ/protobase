import { sql, type SqlBool } from 'kysely'
import type { ResourceModel } from '@protobase/schema'
import { baseQuery } from './base-query'
import { columnRef, requireField } from './columns'
import type { Db } from './db'
import { QueryError } from './errors'
import { assertFilterRequirements } from './filter-requirements'
import { measureSql, measureValue } from './measure'
import { toNumber } from './numbers'
import { seriesBuckets } from './series-buckets'
import type { SeriesOptions } from './series'

const defaultLimit = 8
const maxLimit = 100
const unsplittable = ['date', 'timestamp', 'json']

export type SplitSeriesOptions = SeriesOptions & { limit?: number }
/** The rows of one split value in one bucket; buckets and values without rows have no point. */
export type SplitPoint = { bucket: string; split: unknown; count: number; sum?: number | null; average?: number | null }

/**
 * The rows of each calendar bucket of `field` (as `series` buckets it) split by the values of another field.
 * Only the `limit` largest values over the whole range are kept, ranked by the sum with a sum measure and by row count
 * otherwise (averages of averages add up to nothing); `splits` lists them in rank order, and a point is present only
 * where a value has rows. What the other values hold is the bucket's total from `series` minus its points.
 */
export const splitSeries = async (
  db: Db,
  model: ResourceModel,
  field: string,
  split: string,
  options: SplitSeriesOptions,
): Promise<{ splits: unknown[]; points: SplitPoint[] }> => {
  const { col, from, to, unit, bound, local, isDate } = seriesBuckets(model, field, options)
  const splitField = requireField(model, split, 'filterable')
  if (unsplittable.includes(splitField.type)) {
    throw new QueryError('unsupported_field_type', `Cannot split by "${split}", which is ${splitField.type}`)
  }
  // A sensitive value never leaves the server
  if (splitField.sensitive) throw new QueryError('unsupported_field_type', `"${split}" is sensitive, so it cannot be split by`)
  if (split === field) throw new QueryError('invalid_option', 'A series cannot be split by its own field')
  const limit = options.limit ?? defaultLimit
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    throw new QueryError('invalid_option', `limit must be between 1 and ${maxLimit}`)
  }

  const { measure } = options
  const amount = measure ? measureSql(model, measure) : undefined
  await assertFilterRequirements(db, options.filter, options.scope)
  const splitCol = columnRef(splitField)
  const bucketSql = sql`to_char(date_trunc(${unit}, ${isDate ? sql`${col}::timestamp` : local(col)}), 'YYYY-MM-DD"T"HH24:MI:SS')`

  const parts = baseQuery(db, model, options.filter, options.scope)
    .where(sql<SqlBool>`${col} >= ${from}::${bound} and ${col} < ${to}::${bound}`)
    .select([
      bucketSql.as('bucket'),
      sql`${splitCol}`.as('split'),
      sql`count(*)`.as('n'),
      ...(amount ? [sql`${amount}`.as('m')] : []),
    ])
    .groupBy([sql`1`, sql`2`])

  const largest = measure?.kind === 'sum' ? sql`sum(m::numeric) desc nulls last` : sql`sum(n::bigint) desc`
  const result = await sql<{ bucket: string; split: unknown; rank: string; n: unknown; m?: unknown }>`
    with c as (${parts}), r as (
      select split, row_number() over (order by ${largest}, split asc) as rank
      from c group by split order by rank limit ${sql.lit(limit)}
    )
    select c.bucket, c.split, r.rank::text as rank, c.n::text as n${amount ? sql`, c.m::text as m` : sql``}
    from c join r on c.split is not distinct from r.split
    order by c.bucket, r.rank
  `.execute(db)

  const byRank = new Map<number, unknown>()
  const points = result.rows.map((row) => {
    byRank.set(toNumber(row.rank), row.split)
    const point = { bucket: row.bucket, split: row.split, count: toNumber(row.n) }
    return measure ? { ...point, [measure.kind]: measureValue(row.m) } : point
  })
  const splits = [...byRank].sort(([a], [b]) => a - b).map(([, value]) => value)
  return { splits, points }
}
