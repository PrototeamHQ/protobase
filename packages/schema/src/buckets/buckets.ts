import type { Field } from '../field'
import type { FieldRefs, Ref } from '../refs'
import type { BucketEvery, BucketMeasure } from './buckets-model'

/** The measures of `.bucketsOf()`: per integer, bigint or decimal field of the source, what to keep of it. */
export type BucketMeasuresInput<S> = { readonly [K in keyof FieldRefs<S>]?: readonly BucketMeasure[] }

/** The second argument of `.bucketsOf()`. */
export type BucketsSpec<S, B extends readonly Ref[], M extends BucketMeasuresInput<S>> = {
  /** The timestamp field whose hour or day, in UTC, is a record's bucket. */
  time: (r: FieldRefs<S>) => Ref
  /** The size of the buckets. */
  every: BucketEvery
  /** The fields to group by besides the bucket; the source's tenant field must be one of them. */
  by: (r: FieldRefs<S>) => B
  /** The number fields to keep, each with `sum`, `max` or both; the count of records is always kept. */
  measures?: M
  /** How late a record may arrive and still be counted: a number of minutes, hours or days, such as `'2 hours'`. */
  late: string
}

/** The fields of a time rollup: its key `id`, `bucket`, the `by` fields, the count `events`, and the measures' `<name>_sum` and `<name>_max`. */
export type BucketFields<S, B extends readonly Ref[], M> = {
  /** The record's key, a bigint. */
  id: Field<string>
  /** The start of the bucket's hour or day. */
  bucket: Field<string>
  /** How many records of the source fell in the bucket, a bigint. */
  events: Field<string>
} & {
  [R in B[number] as R['name']]: R['name'] extends keyof S ? (S[R['name']] extends Field<infer V> ? Field<V> : never) : never
} & {
  [K in keyof M & string as M[K] extends readonly (infer A)[] ? ('sum' extends A ? `${K}_sum` : never) : never]: Field<string | null>
} & {
  [K in keyof M & string as M[K] extends readonly (infer A)[] ? ('max' extends A ? `${K}_max` : never) : never]: K extends keyof S ? (S[K] extends Field<infer V> ? Field<V | null> : never) : never
}
