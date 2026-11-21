/**
 * The record a lookup field reads and the field it shows (`.lookup()`). Without `from` the record is the one this
 * record's relation `via` points at (belongs to); with `from` it is the one record of `from` whose relation `via` points
 * at this record (has one). See [Lookups](docs/website/src/content/docs/reference/data-config.mdx#lookups).
 */
export type Lookup = {
  /** The relation of one column it goes through: this resource's own, or `from`'s that points at this resource. */
  via: string
  /** The resource holding, for each record, at most one record whose `via` points at it; omitted for this resource's own relation. */
  from?: string
  /** The field of the linked record it shows. */
  field: string
}
