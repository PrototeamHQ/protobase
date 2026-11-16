import type { Styled } from './block-props'
import { defineBlock } from './create-node'
import type { LayoutNode } from './node'
import type { ArrayFieldInput, RecordsIteratorInput, ReferenceArrayFieldInput, ReferenceFieldInput, ReferenceManyFieldInput } from './typed/inputs'
import type { ResourceName } from './typed/types'

export type * from './list-block-props'

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
