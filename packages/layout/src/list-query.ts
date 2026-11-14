import type { LayoutValue } from './node'

// A list context's read as the list API takes it: react-admin's sort and filter objects written as the AIP-132 order
// and AIP-160 filter they mean, and the condition that ties the list to the record around it.

const isObject = (value: LayoutValue | undefined): value is Record<string, LayoutValue> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** A value as an AIP-160 literal: text in double quotes, its backslashes and quotes escaped. */
export const filterLiteral = (value: unknown) => (typeof value === 'number' || typeof value === 'boolean' ? String(value) : `"${String(value).replace(/\\/g, '\\\\').replaceAll('"', '\\"')}"`)

/** `sort` as AIP-132: a string as it is, react-admin's `{ field, order }` as `field` or `field desc`. */
export const sortText = (sort: LayoutValue | undefined): string | undefined => {
  if (typeof sort === 'string') return sort
  if (!isObject(sort)) return
  return sort.order === 'DESC' ? `${sort.field} desc` : String(sort.field)
}

/** `filter` as AIP-160: a string as it is, react-admin's object as an AND of its equalities, `null` as `isNull(field)`. */
export const filterText = (filter: LayoutValue | undefined): string | undefined => {
  if (typeof filter === 'string') return filter
  if (!isObject(filter)) return
  const terms = Object.entries(filter).map(([name, value]) => (value === null ? `isNull(${name})` : `${name} = ${filterLiteral(value)}`))
  return terms.length === 0 ? undefined : terms.join(' AND ')
}

/** `terms` ANDed, each in parentheses so an `OR` in one stays inside it; empty ones are left out. */
export const allOf = (...terms: Array<string | undefined>) => {
  const kept = terms.filter((term): term is string => term !== undefined && term.trim() !== '')
  return kept.length <= 1 ? kept[0] : kept.map((term) => `(${term})`).join(' AND ')
}

/**
 * The filter a `ReferenceManyField` reads: `target` equal to the record's `source` value and its own `filter`;
 * `undefined` when the record holds no value there, so no record can match.
 */
export const referenceManyFilter = (target: string, value: unknown, filter: LayoutValue | undefined) =>
  value === null || value === undefined ? undefined : allOf(`${target} = ${filterLiteral(value)}`, filterText(filter))

/**
 * The filter a `ReferenceArrayField` reads: its keys in the record's list `ids`, and its own `filter`; `undefined` when
 * the list holds no key, so no record can match. The read plan replaces it with a `related()` read.
 */
export const referenceArrayFilter = (key: string, ids: unknown, filter: LayoutValue | undefined) => {
  const keys = Array.isArray(ids) ? ids.filter((id) => typeof id === 'string' || typeof id === 'number') : []
  return keys.length === 0 ? undefined : allOf(`in(${key}, ${keys.map(filterLiteral).join(', ')})`, filterText(filter))
}
