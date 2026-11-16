import type { Styled } from './block-props'
import type { LayoutChildren, LayoutNode } from './node'

// The blocks that put a list of records in context, and the one that draws its children once per record, after
// react-admin's ReferenceManyField, ReferenceArrayField, ArrayField, RecordsIterator and ReferenceField: the same
// names, props and defaults. https://marmelab.com/react-admin/ReferenceManyField.html

/** One sort field, as react-admin writes it. */
export type SortObject = { field: string; order: 'ASC' | 'DESC' }

/** Equalities ANDed together, as react-admin writes a filter: `{ status: 'open' }` is `status = "open"`. */
export type FilterObject = Record<string, string | number | boolean | null>

type ListShape = {
  /** An AIP-132 order such as `created_at desc`, or react-admin's `{ field, order }`; default the key, descending. */
  sort?: string | SortObject
  /** An AIP-160 filter such as `status = "open" OR done = true`, or react-admin's object of equalities. */
  filter?: string | FilterObject
  /** How many records it reads, at most 500, the API's largest page. */
  perPage?: number
  /** Shown instead of the children when no record matches. */
  empty?: string
}

/**
 * The records of `reference` whose `target` holds this record's `source` (default `id`), as a list its children draw,
 * such as a `RecordsIterator` or a `Table`.
 */
export type ReferenceManyFieldProps = ListShape & {
  reference: string
  target: string
  source?: string
  /** `more` adds a button that reads the next `perPage` records into the same list. */
  pagination?: 'more'
  children?: LayoutChildren
}

/** The records of `reference` whose keys the record's `source`, a JSON list of keys, holds, as a list its children draw; `perPage` defaults to 500. */
export type ReferenceArrayFieldProps = ListShape & { source: string; reference: string; children?: LayoutChildren }

/** The items of the record's `source`, a JSON list, as a list its children draw; a text item is read as `this`. */
export type ArrayFieldProps = { source: string; children?: LayoutChildren }

/** Its children once per record of the list around it, each inside that record, with nothing around them. */
export type RecordsIteratorProps = { children?: LayoutChildren }

/**
 * The record of `reference` the record's `source` points at: its children inside that record, or its title without
 * children. `link` (default `edit`) links it to the record's page; `false` does not.
 */
export type ReferenceFieldProps = { source: string; reference: string; link?: 'edit' | 'show' | false; /** Shown when the field holds no key. */ empty?: string; children?: LayoutChildren }
