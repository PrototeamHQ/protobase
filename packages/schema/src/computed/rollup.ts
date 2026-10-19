/** What a rollup computes over the other resource's records: how many there are, or the sum, average, least or greatest of a field. */
export type RollupFn = 'count' | 'sum' | 'avg' | 'min' | 'max'

/** Which records a rollup reads (`.rollup()`). */
export type RollupSource = {
  /** The resource whose records it reads. */
  from: string
  /** The relation field of `from` that points at this resource: the records whose `via` is this record count. */
  via: string
}

/** A rollup that counts the records, or with `field` those where it is not empty. */
export type RollupCount = RollupSource & {
  /** Counts the records. */
  fn: 'count'
  /** The field of `from` that must not be empty for a record to count. */
  field?: string
}

/** A rollup of the values of a field of the records. */
export type RollupValue = RollupSource & {
  /** The sum, average, least or greatest value of `field`. */
  fn: Exclude<RollupFn, 'count'>
  /** The number field of `from` it takes. */
  field: string
}

/** A rollup's source and what it computes (`.rollup()`). */
export type Rollup = RollupCount | RollupValue
