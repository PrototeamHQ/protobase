import type { CheckedFilter, Literal, ResourceModel } from '@protobase/schema'

const span = { start: 0, end: 0 }

const literalOf = (value: string | number): Literal =>
  typeof value === 'number' ? { kind: 'number', value, raw: String(value), span } : { kind: 'string', value, span }

/** The record with this key, as a filter: each part of the primary key equal to its value. */
export const keyFilter = (model: ResourceModel, key: (string | number)[]): CheckedFilter => {
  const parts = model.primaryKey.map((name, i): CheckedFilter => ({ kind: 'compare', op: '=', field: model.fields[name]!, value: literalOf(key[i]!), span }))
  return parts.length === 1 ? parts[0]! : { kind: 'and', args: parts, span }
}
