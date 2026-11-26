import type { CheckedFilter, Literal, ResourceModel } from '@protobase/schema'

const span = { start: 0, end: 0 }

const literalOf = (value: string | number): Literal =>
  typeof value === 'number' ? { kind: 'number', value, raw: String(value), span } : { kind: 'string', value, span }

/** The record with this key, as a filter: each part of the primary key among its one value, as `=` reads a `*` in text as a wildcard. */
export const keyFilter = (model: ResourceModel, key: (string | number)[]): CheckedFilter => {
  const parts = model.primaryKey.map((name, i): CheckedFilter => ({ kind: 'in', field: model.fields[name]!, values: [literalOf(key[i]!)], span }))
  return parts.length === 1 ? parts[0]! : { kind: 'and', args: parts, span }
}
