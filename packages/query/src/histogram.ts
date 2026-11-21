import { sql, type SqlBool } from 'kysely'
import type { CheckedFilter, ResourceModel } from '@protobase/schema'
import { baseQuery } from './base-query'
import { columnRef, requireField } from './columns'
import type { Db } from './db'
import { QueryError } from './errors'
import type { Scope } from './scope'
import { assertFilterRequirements } from './filter-requirements'
import { toNumber } from './numbers'

const maxBuckets = 200
const numericTypes = ['integer', 'bigint', 'decimal', 'currency']

export type HistogramBucket = { from: number; to: number; count: number }
export type Histogram = { min: number | null; max: number | null; buckets: HistogramBucket[] }

/** The column of a numeric filterable field that a histogram of `buckets` can bucket, or a `QueryError`. */
export const histogramColumn = (model: ResourceModel, field: string, buckets: number) => {
  const target = requireField(model, field, 'filterable')
  if (!numericTypes.includes(target.type)) {
    throw new QueryError('unsupported_field_type', `Histogram needs a numeric field, "${field}" is ${target.type}`)
  }
  if (!Number.isInteger(buckets) || buckets < 1 || buckets > maxBuckets) {
    throw new QueryError('invalid_option', `buckets must be between 1 and ${maxBuckets}`)
  }
  return columnRef(target)
}

/** Which of `buckets` equal-width buckets between `min` and `max` a value falls in, from 1; the maximum is in the last. */
export const bucketOf = (column: unknown, min: number, max: number, buckets: number) =>
  sql`least(width_bucket(${column}::float8, ${min}::float8, ${max}::float8, ${buckets}::int), ${buckets}::int)`

/** The buckets between `min` and `max` with their counts by `bucketOf`, empty ones included. */
export const histogramOf = (min: number, max: number, buckets: number, counts: Map<number, number>): Histogram => {
  const width = (max - min) / buckets
  return {
    min,
    max,
    buckets: Array.from({ length: buckets }, (_, i) => ({
      from: min + i * width,
      to: i === buckets - 1 ? max : min + (i + 1) * width,
      count: counts.get(i + 1) ?? 0,
    })),
  }
}

/** Equal-width buckets between the filtered min and max, empty buckets included. */
export const histogram = async (db: Db, model: ResourceModel, field: string, filter: CheckedFilter | undefined, buckets: number, scope?: Scope): Promise<Histogram> => {
  const col = histogramColumn(model, field, buckets)
  await assertFilterRequirements(db, filter, scope)
  const present = baseQuery(db, model, filter, scope).where(sql<SqlBool>`${col} is not null`)

  const bounds = await present
    .select([sql`min(${col})::float8::text`.as('lo'), sql`max(${col})::float8::text`.as('hi')])
    .executeTakeFirstOrThrow()
  if (bounds.lo === null || bounds.hi === null) return { min: null, max: null, buckets: [] }
  const min = Number(bounds.lo)
  const max = Number(bounds.hi)

  if (min === max) {
    const total = await present.select(sql`count(*)::text`.as('n')).executeTakeFirstOrThrow()
    return { min, max, buckets: [{ from: min, to: max, count: toNumber(total.n) }] }
  }

  const counted = await present
    .select([bucketOf(col, min, max, buckets).as('bucket'), sql`count(*)::text`.as('n')])
    .groupBy(sql`1`)
    .execute()
  return histogramOf(min, max, buckets, new Map(counted.map(row => [toNumber(row.bucket), toNumber(row.n)])))
}
