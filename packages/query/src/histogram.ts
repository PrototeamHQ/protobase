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

/** Equal-width buckets between the filtered min and max, empty buckets included. */
export const histogram = async (db: Db, model: ResourceModel, field: string, filter: CheckedFilter | undefined, buckets: number, scope?: Scope): Promise<Histogram> => {
  const target = requireField(model, field, 'filterable')
  if (!numericTypes.includes(target.type)) {
    throw new QueryError('unsupported_field_type', `Histogram needs a numeric field, "${field}" is ${target.type}`)
  }
  if (!Number.isInteger(buckets) || buckets < 1 || buckets > maxBuckets) {
    throw new QueryError('invalid_option', `buckets must be between 1 and ${maxBuckets}`)
  }
  await assertFilterRequirements(db, filter, scope)
  const col = columnRef(target)
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
    .select([
      sql`least(width_bucket(${col}::float8, ${min}::float8, ${max}::float8, ${buckets}::int), ${buckets}::int)`.as('bucket'),
      sql`count(*)::text`.as('n'),
    ])
    .groupBy(sql`1`)
    .execute()
  const counts = new Map(counted.map(row => [toNumber(row.bucket), toNumber(row.n)]))
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
