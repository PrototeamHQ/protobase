import { createWhere, parseFilter, printFilter, type RelatedModel, type ResourceModel } from '@protobase/schema'

const where = createWhere()

// A single condition stays as it is, so the list that "View all" opens reads it as its own filter
const and = (...parts: Array<string | undefined>) => {
  const given = parts.filter((part): part is string => Boolean(part))
  return given.length === 1 ? given[0]! : given.map((part) => `(${part})`).join(' AND ')
}

/**
 * The filter on a related section's resource: its `field` is this record's key, or, through a join resource, one of
 * the keys the join records that point at this record hold. `null` without a key, so nothing can match.
 */
export const relatedMatch = (item: RelatedModel, value: string | number | boolean | null, resources: Record<string, ResourceModel>) => {
  const { through } = item
  if (value === null) return null
  if (!through) return and(printFilter(where.eq(item.field, value)), item.filter)
  const key = through.key ?? resources[through.resource]?.primaryKey[0]
  const links = parseFilter(and(printFilter(where.eq(through.field, value)), through.filter))
  if (!links.ok || !key) return null
  return and(printFilter(where.related(item.field, through.resource, key, links.ast)), item.filter)
}
