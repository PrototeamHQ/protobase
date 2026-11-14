import type { Styled } from './blocks'
import { defineBlock } from './create-node'
import type { LayoutChildren } from './node'

// The blocks that put a list of records in context, and the one that draws its children once per record, after
// react-admin's ReferenceManyField, ReferenceArrayField, ArrayField, RecordsIterator and ReferenceField: the same
// names, props and defaults. https://marmelab.com/react-admin/ReferenceManyField.html

/** One sort field, as react-admin writes it. */
export type SortObject = { field: string; order: 'ASC' | 'DESC' }

/** Equalities ANDed together, as react-admin writes a filter: `{ status: 'open' }` is `status = "open"`. */
export type FilterObject = Record<string, string | number | boolean | null>

type ListShape = {
  /** An AIP-132 order such as `created_at desc`, or react-admin's `{ field, order }`. */
  sort?: string | SortObject
  /** An AIP-160 filter such as `status = "open" OR done = true`, or react-admin's object of equalities. */
  filter?: string | FilterObject
  /** How many records it reads; default 25. */
  perPage?: number
}

/**
 * The records of `reference` whose `target` holds this record's `source` (default `id`), as a list its children draw,
 * such as a `RecordsIterator` or a `Table`.
 */
export type ReferenceManyFieldProps = ListShape & {
  reference: string
  target: string
  source?: string
  /** Shown instead of the children when no record matches. */
  empty?: string
  /** `more` adds a button that reads the next `perPage` records into the same list. */
  pagination?: 'more'
  children?: LayoutChildren
}

/** The records of `reference` whose keys the record's `source`, a JSON list of keys, holds, as a list its children draw. */
export type ReferenceArrayFieldProps = ListShape & { source: string; reference: string; children?: LayoutChildren }

/** The items of the record's `source`, a JSON list, as a list its children draw; a text item is read as `this`. */
export type ArrayFieldProps = { source: string; children?: LayoutChildren }

/** Its children once per record of the list around it, each inside that record, with nothing around them. */
export type RecordsIteratorProps = { children?: LayoutChildren }

/**
 * The record of `reference` the record's `source` points at: its children inside that record, or its title without
 * children. `link` (default `edit`) links it to the record's page; `false` does not.
 */
export type ReferenceFieldProps = { source: string; reference: string; link?: 'edit' | 'show' | false; emptyText?: string; children?: LayoutChildren }

const builtIn = <P>(name: string) => defineBlock<P & Styled>(name, false)

export const ReferenceManyField = builtIn<ReferenceManyFieldProps>('ReferenceManyField')
export const ReferenceArrayField = builtIn<ReferenceArrayFieldProps>('ReferenceArrayField')
export const ArrayField = builtIn<ArrayFieldProps>('ArrayField')
export const RecordsIterator = builtIn<RecordsIteratorProps>('RecordsIterator')
export const ReferenceField = builtIn<ReferenceFieldProps>('ReferenceField')

/** The blocks that put a list in context, which a `RecordsIterator` or a `Table` without `resource` draws. */
export const listContexts = ['ReferenceManyField', 'ReferenceArrayField', 'ArrayField']

/**
 * A `ReferenceManyField`'s `source` when it names none: the `id` of the record nearest around it, as react-admin reads
 * its record context, never one further out.
 */
export const defaultSource = 'this.id'

/** react-admin's default page size. */
export const defaultPerPage = 25
