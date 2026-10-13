import { createWhere, type FilterExpr, type KeyValue, type ResourceModel } from '@protobase/schema'
import { encodeKey } from '@protobase/schema/internal'
import { recordKey } from '../../live/model-helpers'

const where = createWhere()

/** The most saved records one request lists; the user's own are loaded page by page until there are no more. */
export const savedPageSize = 500

/** One of the user's saved records: its own key, and the key of the record its relation points at. */
export type SavedRecord = {
  /** The saved record's key, in the text form the record API takes. */
  key: string
  /** The value of its relation, the key of the record it saves. */
  target: KeyValue
}

// A relation's value is the key it points at; labelled, it comes as `{ id, name }`.
const relationValue = (value: unknown): KeyValue | undefined => {
  if (typeof value === 'string' || typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value) return relationValue((value as { id: unknown }).id)
  return undefined
}

/** The saved records among listed rows of `model`, by the relation `field`; rows without a value are left out. */
export const savedRecordsOf = (model: ResourceModel, field: string, rows: readonly Record<string, unknown>[]): SavedRecord[] =>
  rows.flatMap((row) => {
    const target = relationValue(row[field])
    return target === undefined ? [] : [{ key: encodeKey(recordKey(model, row)), target }]
  })

/** The saved record of the record with this key, the text form the record API takes, if it is saved. */
export const savedFor = (saved: readonly SavedRecord[], key: string) => saved.find((entry) => encodeKey(entry.target) === key)

/** The saved records with one more, until the server answers with its key. */
export const withSaved = (saved: readonly SavedRecord[], target: KeyValue): SavedRecord[] => [...saved, { key: '', target }]

/** The saved records without the one of the record with this key. */
export const withoutSaved = (saved: readonly SavedRecord[], key: string): SavedRecord[] => saved.filter((entry) => encodeKey(entry.target) !== key)

/**
 * The filter of the records the saved ones point at, on the target's single-column key; undefined when there are none,
 * as `in()` needs at least one value.
 */
export const savedScope = (target: ResourceModel, saved: readonly SavedRecord[]): FilterExpr | undefined => {
  const [key] = target.primaryKey
  if (target.primaryKey.length !== 1 || key === undefined) throw new Error(`${target.name} has a composite key, so its saved records cannot be listed`)
  const values = [...new Set(saved.map((entry) => entry.target))]
  return values.length === 0 ? undefined : where.in(key, values as never[])
}
