import type { Styled } from './blocks'
import { defineBlock } from './create-node'
import type { LayoutChildren, LayoutNode } from './node'
import type { ArrayFieldInput, RecordsIteratorInput, ReferenceArrayFieldInput, ReferenceFieldInput, ReferenceManyFieldInput } from './typed/inputs'
import type { ResourceName } from './typed/types'

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

const builtIn = <P>(name: string) => defineBlock<P & Styled>(name, false)

// A block whose props name a resource: its type follows the `reference` it is given, so its fields and sort autocomplete
const typed = <B>(name: string) => builtIn<any>(name) as unknown as B & { readonly blockName: string; readonly custom: boolean }

export const ReferenceManyField = typed<<R extends ResourceName>(props: ReferenceManyFieldInput<R>) => LayoutNode>('ReferenceManyField')
export const ReferenceArrayField = typed<<R extends ResourceName>(props: ReferenceArrayFieldInput<R>) => LayoutNode>('ReferenceArrayField')
export const ArrayField = builtIn<ArrayFieldInput>('ArrayField')
export const RecordsIterator = typed<<R extends string = string>(props: RecordsIteratorInput<R>) => LayoutNode>('RecordsIterator')
export const ReferenceField = typed<<R extends ResourceName>(props: ReferenceFieldInput<R>) => LayoutNode>('ReferenceField')

/** The blocks that put a list in context, which a `RecordsIterator` or a `Table` without `resource` draws. */
export const listContexts = ['ReferenceManyField', 'ReferenceArrayField', 'ArrayField']

/**
 * A `ReferenceManyField`'s `source` when it names none: the `id` of the record nearest around it, as react-admin reads
 * its record context, never one further out.
 */
export const defaultSource = 'this.id'

/** react-admin's page size of a `ReferenceManyField`. */
export const defaultPerPage = 25

/**
 * The most records a list block reads, the API's largest page; also a `ReferenceArrayField`'s default, where
 * react-admin's is 1000.
 */
export const maxPerPage = 500

/** react-admin's default order of a list block, `{ field: 'id', order: 'DESC' }`: the key, descending. */
export const defaultSort = (key: string) => `${key} desc`
