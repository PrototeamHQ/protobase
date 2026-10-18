import type { RelatedModel, ResourceModel } from '@protobase/schema'

// A relation whose records can be opened: one to a resource the caller can see, with a single-column key
const opensTo = (model: ResourceModel, name: string, resources: Record<string, ResourceModel>) => {
  const field = Object.hasOwn(model.fields, name) ? model.fields[name]! : undefined
  return field?.type === 'relation' && field.relation !== undefined && resources[field.relation.resource]?.primaryKey.length === 1
}

/**
 * The relation field whose record a related section's row opens: `item.open`, else the one relation in the listed
 * resource's primary key besides `item.field`, when there is exactly one; none when the rows are records in their own right.
 */
export const relatedOpens = (item: RelatedModel, model: ResourceModel, resources: Record<string, ResourceModel>): string | undefined => {
  if (item.open !== undefined) return item.open !== item.field && opensTo(model, item.open, resources) ? item.open : undefined
  const candidates = model.primaryKey.filter((name) => name !== item.field && name !== model.tenant && opensTo(model, name, resources))
  return candidates.length === 1 ? candidates[0] : undefined
}

/** The key of the record a row's relation `name` points at; a list row holds a shown relation as `{ id, name }`. Undefined when empty. */
export const relationTarget = (row: Record<string, unknown>, name: string): string | number | undefined => {
  const value = row[name]
  const id = typeof value === 'object' && value !== null && 'id' in value ? value.id : value
  return typeof id === 'string' || typeof id === 'number' ? id : undefined
}
