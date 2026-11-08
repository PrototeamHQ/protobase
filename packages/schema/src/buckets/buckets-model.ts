/** The size of a time rollup's buckets: an hour or a day, in UTC. */
export type BucketEvery = 'hour' | 'day'

/** What a time rollup keeps of a number field per bucket, beside the count of records: its sum, its greatest value. */
export type BucketMeasure = 'sum' | 'max'

/** A time rollup of another resource (`.bucketsOf()`), as the server reads it. */
export type BucketsModel = {
  /** The resource whose records it rolls up. */
  from: string
  /** The timestamp field of `from` that puts a record in its bucket. */
  time: string
  /** The size of its buckets. */
  every: BucketEvery
  /** The fields of `from` it groups by, which the rollup has under the same names. */
  by: string[]
  /** The number fields of `from` it keeps, with what it keeps of each, as the fields `<name>_sum` and `<name>_max`. */
  measures: Record<string, BucketMeasure[]>
  /** How late a record may arrive and still be counted by a refresh, such as `2 hours`. */
  late: string
}
