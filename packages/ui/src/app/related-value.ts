import type { RelatedModel } from '@protobase/schema'
import { relationTarget } from './related-opens'

/**
 * The value a related section's `field` is matched against: the record's key, or with `from` that field's value as it
 * is (a relation by its key). Null when the record holds none, so the section lists nothing.
 */
export const relatedValue = (item: RelatedModel, record: Record<string, unknown>, recordKey: string): string | number | boolean | null => {
  if (item.from === undefined) return recordKey
  const value = record[item.from]
  if (typeof value === 'boolean') return value
  return relationTarget(record, item.from) ?? null
}
