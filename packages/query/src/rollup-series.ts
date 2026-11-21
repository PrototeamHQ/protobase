import { sql, type RawBuilder } from 'kysely'
import type { ResourceModel } from '@protobase/schema'
import type { Db } from './db'
import { QueryError } from './errors'

// From finest to coarsest, as `series` takes them
const granularities = ['minute', '5_minutes', '15_minutes', 'hour', 'day', 'week', 'month', 'year']
const bucketSeconds = { hour: 3600, day: 86_400 }

/** Whether a series of `field` reads a time rollup's buckets, whose hours or days in UTC are all it knows of time. */
export const readsBuckets = (model: ResourceModel, field: string) => model.buckets !== undefined && field === 'bucket'

/**
 * Refuses a series a time rollup's buckets cannot give: a granularity finer than its bucket, or for a daily rollup a time
 * zone other than UTC, whose days start at other hours than its own.
 */
export const checkBucketSeries = (model: ResourceModel, field: string, granularity: string, timeZone: string) => {
  if (!readsBuckets(model, field)) return
  const { every } = model.buckets!
  if (granularities.indexOf(granularity) < granularities.indexOf(every)) {
    throw new QueryError('invalid_option', `"${model.name}" keeps ${every}s, so it has no granularity finer than ${every}`)
  }
  if (every === 'day' && timeZone !== 'UTC') {
    throw new QueryError('invalid_option', `"${model.name}" keeps days in UTC, so its series take only the time zone UTC`)
  }
}

type Boundaries = { first: RawBuilder<unknown>; last: RawBuilder<unknown>; step: RawBuilder<unknown>; timeZone: string }

/**
 * Refuses an hourly rollup's series in a time zone where one of its buckets would start or end inside a UTC hour, such
 * as Asia/Kolkata's days, which start at half past: its hours cannot be split. It checks every bucket boundary the series
 * has, the end of the last included, in one query, so a zone is judged by the offsets it has over the range.
 */
export const assertBucketBoundaries = async (db: Db, model: ResourceModel, field: string, { first, last, step, timeZone }: Boundaries) => {
  if (!readsBuckets(model, field)) return
  const seconds = bucketSeconds[model.buckets!.every]
  const result = await sql<{ inside: boolean }>`
    select exists (
      select 1 from generate_series(${first}, ${last} + ${step}, ${step}) as b
      where extract(epoch from b at time zone ${timeZone}::text) % ${sql.lit(seconds)} <> 0
    ) as inside
  `.execute(db)
  if (result.rows[0]?.inside) {
    throw new QueryError('invalid_option', `"${model.name}" keeps whole UTC ${model.buckets!.every}s, and buckets of the time zone ${timeZone} start inside them over this range`)
  }
}
