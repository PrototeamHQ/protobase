// A page's read plan: one ordinary API read per data block, each known before any record is read, so all of them start
// together at page load and none waits for another's rows. A block inside the records of another ties itself to them
// with a `related()` term that carries the outer read's own filter, order and page size, never with their values.

/** What a read asks the API for: a list (`GET /<resource>`), a count of a list, or an `:aggregate`. */
export type PlanReadKind = 'list' | 'count' | 'aggregate'

/**
 * Which of a block's reads it is, when it makes more than one: a `Thread`'s tool calls, the row a `Table`'s `select`
 * chose, or a `<resource>.count` a condition names.
 */
export type PlanReadPart = 'calls' | 'chosen' | 'condition'

export type PlanRead = {
  /** The element that draws it, as a JSON Pointer (RFC 6901) into the page's tree, such as `/children/0/children/2`. */
  block: string
  part?: PlanReadPart
  kind: PlanReadKind
  resource: string
  /**
   * AIP-160, as the list's `filter`. Its `{{@params.name}}` and `{{@root.key}}` slots are the page's address values,
   * filled in before the read; it holds no other slot.
   */
  filter?: string
  /** AIP-132, as the list's `order_by`; the API's default order without one. */
  orderBy?: string
  /** As the list's `page_size`, or an aggregate's `limit`; the API's default without one. */
  pageSize?: number
  /** As `limit_per=<field>:<count>`: the first `count` records per value of `field`, one page per record around it. */
  limitPer?: { field: string; count: number }
  /** An aggregate's `group_by` fields; what it computes per group comes from its block, such as a `Chart`'s `sum`. */
  groupBy?: string[]
  /** As the list's `fields`, the key included: every field drawn in its scope. Every field without it. */
  fields?: string[]
  /** Whether it asks for each record's ETag, which only a record that an `Action` or a form changes needs. */
  etag: boolean
}

/** A custom component that declares no reads, which the plan leaves out: whatever it reads, it reads by itself. */
export type UnplannedBlock = { block: string; type: string }

export type ReadPlan = { reads: PlanRead[]; outside: UnplannedBlock[] }
