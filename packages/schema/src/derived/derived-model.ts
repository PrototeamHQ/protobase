/** A field of a resource's record that a derived value goes into. */
export type DerivedTarget = {
  /** The resource, by name. */
  resource: string
  /** The field, by name. */
  field: string
}

/**
 * A value worked out from other records for each record of a resource (`.derived()`): its compute function is the
 * default export of `derived/<resource>.<name>.ts`, run on the server, which keeps the value current.
 */
export type DerivedModel = {
  /** Unique per resource; camelCase or snake_case. */
  name: string
  /** Where the value goes: a read-only field of the record, or a field of another resource's record of the same key. */
  into?: DerivedTarget
  /** The job enqueued with `{ resource, key, value }` each time the value changes, instead of or beside `into`. */
  job?: string
  /** The resources the compute function may read, besides the record's own; their changes are captured. */
  reads: string[]
  /** `false` reads no queries, so only the dependencies the function names itself and its clock count. */
  track?: false
}
