import type { LayoutNode } from '../node'
import { recordValue } from './record-value'
import type { TextOptions } from './text-form'

// The records a list block holds in the text form: an ArrayField's items from the record around it, the others' from
// what the caller read for it.

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The list a list context holds, or `undefined` when the text does not have it: no record, or nothing the caller read. */
export const listOf = (node: LayoutNode, options: TextOptions): unknown[] | undefined => {
  if (node.custom) return
  if (node.type === 'ArrayField') {
    const items = options.record ? recordValue(options.record, String(node.props.source)) : undefined
    return Array.isArray(items) ? items : options.record ? [] : undefined
  }
  if (node.type === 'ReferenceManyField' || node.type === 'ReferenceArrayField') return options.records?.(node, options.record)
}

/** The record an item is read as: an object as it is, any other value as `this`, as Handlebars reads it. */
export const itemRecord = (item: unknown): Record<string, unknown> => (isRecord(item) ? item : { this: item })

/** The record a `ReferenceField` points at, when the caller read it. */
export const referencedRecord = (node: LayoutNode, options: TextOptions) => options.records?.(node, options.record)?.find(isRecord)
